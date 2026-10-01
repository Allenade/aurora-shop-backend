import { Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource, UserType } from '@app/shared';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { JwtPayload } from '../auth/dto/auth.types';
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
    description:
      'Paystack webhook. The HMAC-SHA512 signature is checked against the raw body. The bank provider callback has been removed; Pay with Transfer uses this Paystack endpoint.',
  })
  callback(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    return this.transactions.handleCallback(
      provider,
      req.body,
      headers,
      req.rawBody,
    );
  }

  @Get(':reference/status')
  @RequirePermissions({ action: Action.READ, resource: Resource.ORDER })
  @ApiOperation({
    operationId: 'getTransactionStatus',
    summary: 'Payment Status',
    description:
      'Current payment state for a reference. Re-verifies pending transactions with Paystack, including amount and currency.',
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
    summary: 'Re-verify payment with Paystack',
    description:
      'Admin re-check. Succeeds only when Paystack verifies the reference, amount, and currency. It no longer marks a bank transfer paid by itself.',
  })
  confirm(@Param('reference') reference: string) {
    return this.transactions.confirmWithProvider(reference);
  }
}
