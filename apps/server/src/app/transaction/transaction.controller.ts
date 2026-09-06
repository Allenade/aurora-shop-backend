import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { TransactionProvider } from '../payment-gateway/_contract/payment.types';
import { TransactionService } from './transaction.service';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactions: TransactionService) {}

  @Public()
  @Post('callback/:provider')
  @ApiOperation({
    operationId: 'handlePaymentCallback',
    summary: 'Payment Webhook',
    description: 'Provider webhook. Signature-checked inside the adapter.',
  })
  callback(
    @Param('provider') provider: TransactionProvider,
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.transactions.handleCallback(provider, body, headers);
  }

  @Post(':reference/confirm')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.TRANSACTION })
  @ApiOperation({
    operationId: 'confirmBankTransfer',
    summary: 'Confirm Transfer',
    description: 'Admin marks a bank transfer as received.',
  })
  confirm(@Param('reference') reference: string) {
    return this.transactions.markSuccess(reference);
  }
}
