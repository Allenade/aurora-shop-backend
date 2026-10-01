import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateRefundDto, ReviewRefundDto } from './dto/refund.dto';
import { RefundService } from './refund.service';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('admin/refunds')
export class RefundController {
  constructor(private readonly refunds: RefundService) {}

  @Post()
  @RequirePermissions({ action: Action.CREATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'createRefundRequest',
    summary: 'Request a refund',
  })
  create(@Body() body: CreateRefundDto, @CurrentUser('sub') userId: string) {
    return this.refunds.create(body, userId);
  }

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'listRefundRequests',
    summary: 'List refund requests',
  })
  list() {
    return this.refunds.list();
  }

  @Get(':id')
  @RequirePermissions({ action: Action.READ, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'getRefundRequest',
    summary: 'Get refund request',
  })
  get(@Param('id') id: string) {
    return this.refunds.get(id);
  }

  @Post(':id/approve')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'approveRefundRequest',
    summary: 'Approve refund',
  })
  approve(
    @Param('id') id: string,
    @Body() body: ReviewRefundDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.refunds.approve(id, body, userId);
  }

  @Post(':id/reject')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'rejectRefundRequest',
    summary: 'Reject refund',
  })
  reject(
    @Param('id') id: string,
    @Body() body: ReviewRefundDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.refunds.reject(id, body, userId);
  }

  @Post(':id/process')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'processRefundRequest',
    summary: 'Process refund with Paystack',
    description:
      'Calls the Paystack refund API and marks the enrollment refunded.',
  })
  process(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.refunds.process(id, userId);
  }
}
