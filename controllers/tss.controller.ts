import { Body, Controller, Post } from '@nestjs/common'

import { ReceiveProposalRequest, ReceiveProposalResponse } from '@dtos'
import { TssService } from '@services'

@Controller('tss')
export class TssController {
    constructor(private readonly tssService: TssService) {}

    @Post('propose')
    async proposeTransaction(
        @Body() data: ReceiveProposalRequest
    ): Promise<ReceiveProposalResponse> {
        return await this.tssService.receiveProposal(
            data.i,
            data.messageHash,
            data.payload
        )
    }
}
