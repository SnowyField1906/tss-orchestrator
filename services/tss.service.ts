import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { firstValueFrom } from 'rxjs'

import { BN, C } from '@common'
import { ReceiveProposalResponse } from '@dtos'
import { Proposal, ProposalDocument } from '@schemas'

import { FundService } from './fund.service'

@Injectable()
export class TssService {
    private nodes: { id: number; url: string }[]
    private threshold: number

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly fundService: FundService,
        @InjectModel(Proposal.name)
        private proposalModel: Model<ProposalDocument>
    ) {
        this.nodes =
            this.configService.get<{ id: number; url: string }[]>('nodes')
        this.threshold = Number(this.configService.get<number>('threshold'))
    }

    async receiveProposal(
        i: number,
        messageHash: string,
        payload: TxPayload
    ): Promise<ReceiveProposalResponse> {
        // Step 1: Handle override
        await this.proposalModel.updateMany(
            { chainId: payload.chainId, proposers: i },
            { $pull: { proposers: i } }
        )
        await this.proposalModel.deleteMany({ proposers: { $size: 0 } })

        // Step 2: Record vote for new proposal
        const proposal = await this.proposalModel.findOneAndUpdate(
            { messageHash },
            {
                $set: { chainId: payload.chainId, payload },
                $addToSet: { proposers: i },
            },
            { upsert: true, new: true }
        )

        // Step 3: Check threshold to execute MPC
        if (proposal.proposers.length === this.threshold) {
            const subsetIds = [...proposal.proposers]

            // Delete proposal out of pool to avoid duplicate
            await this.proposalModel.deleteOne({ messageHash })

            // Trigger asynchronous TSS
            this._executeTssSession(
                messageHash,
                subsetIds,
                proposal.payload
            ).catch((e) =>
                console.error(
                    `[TSS Failure - Chain ${payload.chainId}]:`,
                    e.message
                )
            )

            return { status: 'MATCHED_AND_EXECUTING' }
        }

        return { status: 'VOTE_RECORDED' }
    }

    private async _executeTssSession(
        messageHash: string,
        subsetIds: number[],
        payload: TxPayload
    ) {
        const subset = this.nodes.filter((n) => subsetIds.includes(n.id))

        // Phase 1: Start → E(k_i), E(w_i), Gamma_i, pk_i
        const startPromises = subset.map((node) =>
            firstValueFrom(
                this.httpService.post(`${node.url}/tss/start`, {
                    messageHash,
                    subsetIds,
                })
            )
        )
        const startResults = await Promise.all(startPromises)
        const startData = startResults.map((r) => r.data)

        // Phase 2: MtA → round 1 (k×gamma → delta) + round 2 (k×x → sigma)
        const mtaPromises = subset.map((node) => {
            const others = startData
                .filter((d) => d.i !== node.id)
                .map((d) => ({ j: d.i, E_k: d.E_k, E_x: d.E_x }))
            return firstValueFrom(
                this.httpService.post(`${node.url}/tss/mta`, {
                    messageHash,
                    others,
                })
            )
        })
        const mtaResults = await Promise.all(mtaPromises)
        const mtaData = mtaResults.map((r) => r.data)

        // Phase 3: Delta + Sigma — route alphas/nus to recipients
        const deltaPromises = subset.map((node) => {
            const alphasForMe = mtaData.reduce((acc, curr) => {
                if (curr.i !== node.id) {
                    const alphaObj = curr.alphas.find((a) => a.j === node.id)
                    if (alphaObj)
                        acc.push({
                            j: curr.i,
                            alpha: alphaObj.alpha,
                        })
                }
                return acc
            }, [])

            const nusForMe = mtaData.reduce((acc, curr) => {
                if (curr.i !== node.id) {
                    const nuObj = curr.nus.find((a) => a.j === node.id)
                    if (nuObj) acc.push({ j: curr.i, nu: nuObj.nu })
                }
                return acc
            }, [])

            return firstValueFrom(
                this.httpService.post(`${node.url}/tss/delta`, {
                    messageHash,
                    alphas: alphasForMe,
                    nus: nusForMe,
                })
            )
        })
        const deltaResults = await Promise.all(deltaPromises)
        const deltaData = deltaResults.map((r) => r.data)

        // Compute delta = sum(delta_i) and R = sum(Gamma_i) × delta^{-1} = k^{-1}G
        let delta = BN.ZERO
        for (const d of deltaData) {
            delta = delta.add(BN.from(d.delta_i)).umod(C.ORDER)
        }
        const delta_inv = delta.invm(C.ORDER)

        let GammaSum: any = null
        for (const d of startData) {
            const Gamma_i = C.secp256k1.curve.decodePoint(d.Gamma, 'hex')
            if (GammaSum === null) GammaSum = Gamma_i
            else GammaSum = GammaSum.add(Gamma_i)
        }

        const R = GammaSum.mul(delta_inv)
        const r = R.getX().umod(C.ORDER)

        // Phase 4: Sign → s_i = m·k_i + r·sigma_i
        const signPromises = subset.map((node) =>
            firstValueFrom(
                this.httpService.post(`${node.url}/tss/sign`, {
                    messageHash,
                    r: r.toString(16),
                })
            )
        )
        const signResults = await Promise.all(signPromises)
        const signData = signResults.map((res) => res.data)

        // s = sum(s_i) — GG18 correct: NO delta^{-1}
        // sum(s_i) = m·k + r·k·x = k(m + rx), with R = k^{-1}G → valid ECDSA
        let s = BN.ZERO
        for (const d of signData) {
            s = s.add(BN.from(d.s_i)).umod(C.ORDER)
        }

        // Canonical s
        const halfOrder = C.ORDER.shrn(1)
        if (s.cmp(halfOrder) > 0) {
            s = C.ORDER.sub(s)
        }

        // Commit Global State
        await this.fundService.commitTransaction(payload, {
            r: r.toString(16),
            s: s.toString(16),
        })
    }
}
