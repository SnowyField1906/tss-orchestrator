import { Controller, Post } from '@nestjs/common'

import { InitializeKeyResponse } from '@dtos'
import { DkgService } from '@services'

@Controller('dkg')
export class DkgController {
    constructor(private readonly dkgService: DkgService) {}

    @Post('initialize')
    async initializeKey(): Promise<InitializeKeyResponse> {
        const result = await this.dkgService.initializeKey()
        return result
    }
}
