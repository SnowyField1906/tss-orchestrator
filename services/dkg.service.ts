import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class DkgService {
    private nodes: { id: number; url: string }[]
    private threshold: number

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService
    ) {
        this.nodes =
            this.configService.get<{ id: number; url: string }[]>('nodes')
        this.threshold = this.configService.get<number>('threshold')
    }

    async initializeKey() {
        // Step 1: Tell all nodes to generate their polynomials and broadcast shares
        const broadcastPromises = this.nodes.map((node) =>
            firstValueFrom(
                this.httpService.post(`${node.url}/dkg/broadcast`, {
                    t: this.threshold,
                    n: this.nodes.length,
                })
            )
        )
        const broadcastResults = await Promise.all(broadcastPromises)

        // Step 2: Collect Paillier public keys
        const nodesInfo: {
            [nodeId: string]: { paillierPublicKey: PaillierPublicKey }
        } = {}
        for (let i = 0; i < this.nodes.length; i++) {
            const nodeId = this.nodes[i].id.toString()
            nodesInfo[nodeId] = {
                paillierPublicKey: broadcastResults[i].data.paillierPublicKey,
            }
        }

        // Step 3: Batch all secret shares corresponding to each receiver node
        const batchedShares: { [receiverId: number]: any[] } = {}
        this.nodes.forEach((n) => (batchedShares[n.id] = []))

        for (let i = 0; i < this.nodes.length; i++) {
            const senderNode = this.nodes[i]
            const broadcastData = broadcastResults[i].data

            for (const share of broadcastData.data) {
                batchedShares[share.j].push({
                    i: senderNode.id,
                    encryptedPayload: share.encryptedPayload,
                    commitments: broadcastData.commitments,
                })
            }
        }

        // Step 4: Send batch of data to each node and get Feldman commitments
        const routingPromises = this.nodes.map((node) =>
            firstValueFrom(
                this.httpService.post(`${node.url}/dkg/receive`, {
                    shares: batchedShares[node.id],
                })
            )
        )
        const routingResults = await Promise.all(routingPromises)

        // Step 5: Batch Feldman commitments
        const allFeldmanCommitments: string[][] = []
        for (let i = 0; i < this.nodes.length; i++) {
            const feldmanCommitments = routingResults[i].data.feldmanCommitments
            allFeldmanCommitments.push(feldmanCommitments)
        }

        // Step 6: Distribute Feldman commitments to each node
        const notifyPromises = this.nodes.map((node) =>
            firstValueFrom(
                this.httpService.post(`${node.url}/dkg/compute-public-key`, {
                    feldmanCommitments: allFeldmanCommitments,
                })
            )
        )
        await Promise.all(notifyPromises)

        return { success: true }
    }
}
