import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateRefundDto, DecideRefundDto } from './dto/refund.dto';
import { RefundService } from './refund.service';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('admin/refunds')
export class RefundController {
  constructor(private readonly refunds: RefundService) {}

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'listRefundRequests',
    summary: 'List refund requests',
    description: 'Refund requests for Core 3.0 enrollments.',
  })
  list() {
    return this.refunds.list();
  }

  @Post()
  @RequirePermissions({ action: Action.CREATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'createRefundRequest',
    summary: 'Request a refund',
    description: 'Opens a refund for a paid enrollment.',
  })
  create(@Body() body: CreateRefundDto, @CurrentUser('sub') userId: string) {
    return this.refunds.request(body, userId);
  }

  @Post(':id/approve')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'approveRefundRequest',
    summary: 'Approve refund',
    description:
      'Marks a pending request approved. Does not call Paystack yet.',
  })
  approve(
    @Param('id') id: string,
    @Body() body: DecideRefundDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.refunds.approve(id, body, userId);
  }

  @Post(':id/reject')
  @RequirePermissions({ action: Action.UPDATE, resource: Resource.REFUND })
  @ApiOperation({
    operationId: 'rejectRefundRequest',
    summary: 'Reject refund',
    description: 'Rejects a pending refund request.',
  })
  reject(
    @Param('id') id: string,
    @Body() body: DecideRefundDto,
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
      'Calls the Paystack refund API and sets the enrollment status to refunded.',
  })
  process(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.refunds.process(id, userId);
  }
}
