import { Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import type { Request } from 'express';
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
    summary: 'Paystack Webhook',
    description:
      'Paystack webhook only. The signature is HMAC-SHA512 over the raw body. `bank` is rejected; bank transfers use Paystack Pay with Transfer (`channels: [bank_transfer]`).',
  })
  callback(
    @Param('provider') provider: TransactionProvider,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.transactions.handleCallback(provider, headers, req.rawBody);
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
}
