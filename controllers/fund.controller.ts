import { Controller, Get, Query } from '@nestjs/common'

import {
    GetLatestStateResponse,
    GetMerkleProofResponse,
    GetSettlementDataResponse,
} from '@dtos'
import { FundService } from '@services'

@Controller('fund')
export class FundController {
    constructor(private readonly fundService: FundService) {}

    @Get('latest-state')
    async getLatestState(
        @Query('chainId') chainId: string,
        @Query('userId') userId: string
    ): Promise<GetLatestStateResponse> {
        return await this.fundService.getLatestState(chainId, userId)
    }

    @Get('proof')
    async getMerkleProof(
        @Query('chainId') chainId: string,
        @Query('userId') userId: string
    ): Promise<GetMerkleProofResponse> {
        return await this.fundService
            .getMerkleProof(chainId, userId)
            .then((res) => ({
                balance: `0x${res.balance}`,
                proof: res.proof.map((p) => `0x${p}`),
            }))
    }

    @Get('settlement-data')
    async getSettlementData(
        @Query('chainId') chainId: string
    ): Promise<GetSettlementDataResponse> {
        const res = await this.fundService.getSettlementData(chainId)
        if (!res || !res.signature) return null
        return {
            root: `0x${res.root}`,
            nonce: res.nonce,
            signature: {
                r: `0x${res.signature.r}`,
                s: `0x${res.signature.s}`,
            },
        }
    }
}
