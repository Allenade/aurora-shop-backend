import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { EnterFirstEnrollDto } from './dto/enroll.dto';
import { EnterFirstService } from './enter-first.service';

@ApiTags('Enter First')
@Controller()
export class EnterFirstController {
  constructor(private readonly enterFirst: EnterFirstService) {}

  @Public()
  @Post('enter-first/enrollments')
  @ApiOperation({
    operationId: 'createEnterFirstEnrollment',
    summary: 'Enroll + start Paystack',
    description:
      'Public website enrollment. Creates a pending record, initializes Paystack when amount > 0, returns authorizationUrl.',
  })
  enroll(@Body() body: EnterFirstEnrollDto) {
    return this.enterFirst.enroll(body);
  }

  @Public()
  @Get('enter-first/enrollments/by-reference/:reference/status')
  @ApiOperation({
    operationId: 'getEnterFirstPaymentStatus',
    summary: 'Enter First payment status',
    description:
      'Public status check after Paystack redirect. Re-verifies pending payments with Paystack.',
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
      'Website / Enter First payment enrollments for admin. Supports q, paymentStatus, page, limit.',
  })
  list(
    @Query('q') q?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.enterFirst.list({
      q,
      paymentStatus,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @ApiBearerAuth()
  @Get('admin/enter-first/enrollments/:id')
  @RequirePermissions({ action: Action.READ, resource: Resource.ENTER_FIRST })
  @ApiOperation({
    operationId: 'getEnterFirstEnrollment',
    summary: 'Get Enter First enrollment',
    description: 'Full enrollment + form payload for admin detail drawer.',
  })
  get(@Param('id') id: string) {
    return this.enterFirst.getById(id);
  }
}
