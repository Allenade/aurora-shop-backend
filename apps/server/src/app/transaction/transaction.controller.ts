import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
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

  @Get(':reference/status')
  @RequirePermissions({ action: Action.READ, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'getTransactionStatus',
    summary: 'Payment Status',
    description:
      'Current payment state for a reference. Re-verifies pending transactions with the provider.',
  })
  status(
    @Param('reference') reference: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactions.verifyForUser(
      reference,
      user.sub,
      user.type === UserType.ADMIN,
    );
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
