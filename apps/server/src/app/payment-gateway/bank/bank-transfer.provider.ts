import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvTypes } from '@app/shared';
import {
  TransactionProvider,
  TransactionStatus,
  type CallbackOutcome,
  type PaymentProvider,
  type RegisterContext,
  type RegisterResult,
} from '../_contract/payment.types';

@Injectable()
export class BankTransferProvider implements PaymentProvider {
  readonly id = TransactionProvider.BANK;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {}

  register(ctx: RegisterContext): Promise<RegisterResult> {
    return Promise.resolve({
      externalReference: ctx.reference,
      bank: {
        bank: this.config.get('bank.name', { infer: true }),
        accountName: this.config.get('bank.accountName', { infer: true }),
        accountNumber: this.config.get('bank.accountNumber', { infer: true }),
      },
    });
  }

  extractCallbackReference(payload: unknown): string | null {
    const body = payload as { reference?: string };
    return body.reference ?? null;
  }

  parseCallback(payload: unknown): CallbackOutcome {
    const body = payload as { reference?: string; status?: string };
    return {
      externalReference: body.reference ?? '',
      status:
        body.status === 'success'
          ? TransactionStatus.SUCCESS
          : TransactionStatus.FAILED,
    };
  }
}
