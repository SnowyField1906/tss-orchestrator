import { SMT } from '@common'
import { FundService } from '@services/fund.service'

class MockModel {
    private data: any[] = []
    constructor(initData?: any) {
        if (initData) Object.assign(this, initData)
    }
    async findOne(query: any = {}) {
        return this.data.find((item) => item.chainId === query.chainId) || null
    }
    async updateOne(query: any = {}, updateData: any = {}, options: any = {}) {
        const foundIndex = this.data.findIndex(
            (item) => item.chainId === query.chainId
        )
        const update = updateData.$set || updateData
        if (foundIndex === -1) {
            if (options.upsert) {
                this.data.push({ chainId: query.chainId, ...update })
                return { acknowledged: true, modifiedCount: 1 }
            }
            return { acknowledged: true, modifiedCount: 0 }
        }
        this.data[foundIndex] = { ...this.data[foundIndex], ...update }
        return { acknowledged: true, modifiedCount: 1 }
    }
}

describe('Orchestrator FundService (Matchmaker Architecture)', () => {
    let fundService: FundService
    let mockModel: MockModel

    const chainId = 'mainnet_1'
    const userA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const userB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    beforeAll(() => {
        mockModel = new MockModel()
        fundService = new FundService(mockModel as any)
    })

    it('Phase 1.1: getLatestState returns empty and valid fallback state for a new chain', async () => {
        const state = await fundService.getLatestState(chainId, userA)
        expect(state.nonce).toBe(0)
        expect(state.oldBalance).toBe('0')
    })

    it('Phase 1.2: getSettlementData returns null gracefully if chain does not exist', async () => {
        const settlementData =
            await fundService.getSettlementData('non_existent_chain')
        expect(settlementData).toBeNull()
    })

    const tx1_amount = '100'
    const tx2_amount = '200'
    const signature1 = { r: 'mock_r_1', s: 'mock_s_1' }
    const signature2 = { r: 'mock_r_2', s: 'mock_s_2' }

    it('Phase 2.1: commitTransaction processes successful TSS Match for User A', async () => {
        await fundService.commitTransaction(
            { chainId, userId: userA, amount: tx1_amount },
            signature1
        )
        const state = await fundService.getLatestState(chainId, userA)
        expect(state.nonce).toBe(1)
        expect(state.oldBalance).toBe(tx1_amount)
    })

    it('Phase 2.2: getSettlementData formats EVM-ready signature correctly', async () => {
        const settlementData = await fundService.getSettlementData(chainId)

        expect(settlementData).toBeDefined()
        expect(settlementData.nonce).toBe(1)
        expect(settlementData.signature).toEqual({
            r: 'mock_r_1',
            s: 'mock_s_1',
        })
        expect(settlementData.root).not.toBe(new SMT().getRoot())
    })

    it('Phase 3.1: commitTransaction processes sequential TSS Match for a NEW User B', async () => {
        const payload = { chainId, userId: userB, amount: tx2_amount }
        await fundService.commitTransaction(payload, signature2)

        const stateB = await fundService.getLatestState(chainId, userB)
        expect(stateB.nonce).toBe(2)
        expect(stateB.oldBalance).toBe(tx2_amount)
        expect(stateB.signature).toEqual(signature2)
    })

    it('Phase 3.2: getMerkleProof returns valid proofs for all active users', async () => {
        const proofA = await fundService.getMerkleProof(chainId, userA)
        const proofB = await fundService.getMerkleProof(chainId, userB)

        expect(proofA.balance).toBe(tx1_amount)
        expect(proofB.balance).toBe(tx2_amount)
        expect(proofA.proof.length).toBe(256)
        expect(proofB.proof.length).toBe(256)

        const currentState = await fundService.getLatestState(chainId, userA)

        const smt = new SMT()
        const leafA = userA + tx1_amount.padStart(64, '0')
        expect(smt.verify(userA, leafA, proofA.proof, currentState.root)).toBe(
            true
        )

        const leafB = userB + tx2_amount.padStart(64, '0')
        expect(smt.verify(userB, leafB, proofB.proof, currentState.root)).toBe(
            true
        )
    })

    it('Phase 4.1: getMerkleProof handles unregistered user without throwing errors', async () => {
        const unknownUser = 'cccccccccccccccccccccccccccccccccccccccc'
        const proofUnknown = await fundService.getMerkleProof(
            chainId,
            unknownUser
        )

        expect(proofUnknown.balance).toBe('0')
        expect(proofUnknown.proof.length).toBe(256)
    })
})
