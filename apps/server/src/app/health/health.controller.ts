import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Health Check',
    description: 'Liveness probe for the HTTP API.',
  })
  getHealth() {
    return { ok: true, service: 'aurora-shop-api' };
  }
}
