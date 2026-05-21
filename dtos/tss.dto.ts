export class SignTransactionRequest {
    chainId: string
    userId: string
    amount: string
    oldBalance: string
    merkleProof: string[]
    subsetIds: number[]
}
export class SignTransactionResponse {
    success: boolean
    r: string
    s: string
}

export class ReceiveProposalRequest {
    i: number
    messageHash: string
    payload: TxPayload
}
export class ReceiveProposalResponse {
    status: string
}
