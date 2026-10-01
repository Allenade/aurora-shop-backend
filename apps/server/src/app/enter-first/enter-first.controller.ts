import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Action, Resource } from '@app/shared';
import type { Request } from 'express';
import { AccessService } from '../access/access.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { resolveClientIp } from '../../common/client-ip';
import { ClientIpThrottlerGuard } from '../../common/guards/client-ip-throttler.guard';
import { EnterFirstEnrollDto } from './dto/enroll.dto';
import { EnterFirstService } from './enter-first.service';

@ApiTags('Enter First')
@Controller()
export class EnterFirstController {
  constructor(
    private readonly enterFirst: EnterFirstService,
    private readonly access: AccessService,
  ) {}

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('enter-first/enrollments')
  @ApiOperation({
    operationId: 'createEnterFirstEnrollment',
    summary: 'Enroll + start Paystack',
    description:
      'Public website enrollment. Price is taken from the course catalogue. Requires terms, privacy, and age confirmation. Paystack checkout includes bank_transfer.',
  })
  enroll(@Body() body: EnterFirstEnrollDto, @Req() req: Request) {
    const hops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
    return this.enterFirst.enroll(body, {
      ip: resolveClientIp({
        socketIp: req.ip || req.socket?.remoteAddress,
        forwardedFor: req.headers['x-forwarded-for'],
        trustProxyHops: Number.isFinite(hops) ? hops : 1,
      }),
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
  }

  @Public()
  @UseGuards(ClientIpThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('enter-first/enrollments/by-reference/:reference/status')
  @ApiOperation({
    operationId: 'getEnterFirstPaymentStatus',
    summary: 'Enter First payment status',
    description:
      'Public status check after Paystack redirect. Re-verifies pending payments with Paystack and checks the charged amount.',
  })
  status(@Param('reference') reference: string) {
    return this.enterFirst.statusByReference(reference);
  }

  @ApiBearerAuth()
  @Get('admin/enter-first/enrollments')
  @RequirePermissions({ action: Action.LIST, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'listEnterFirstEnrollments',
    summary: 'List Enter First enrollments',
    description:
      'Admin list. compliance_viewer responses mask email, phone, and date of birth.',
  })
  async list(
    @CurrentUser('sub') userId: string,
    @Query('q') q?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const maskPii = !(await this.access.canViewPii(userId));
    return this.enterFirst.list({
      q,
      paymentStatus,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      maskPii,
    });
  }

  @ApiBearerAuth()
  @Get('admin/enter-first/enrollments/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'getEnterFirstEnrollment',
    summary: 'Get Enter First enrollment',
    description: 'Full enrollment. PII is masked for compliance_viewer.',
  })
  async get(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    const maskPii = !(await this.access.canViewPii(userId));
    return this.enterFirst.getById(id, maskPii);
  }
}
