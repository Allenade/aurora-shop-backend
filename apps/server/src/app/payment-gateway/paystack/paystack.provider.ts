import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
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
export class PaystackProvider implements PaymentProvider {
  readonly id = TransactionProvider.PAYSTACK;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {}

  async register(ctx: RegisterContext): Promise<RegisterResult> {
    const secret = this.config.get('paystack.secretKey', { infer: true });
    const publicKey = this.config.get('paystack.publicKey', { infer: true });
    if (!secret) {
      return {
        externalReference: ctx.reference,
        authorizationUrl: `${ctx.callbackUrl}?reference=${ctx.reference}&mock=1`,
        publicKey,
        metadata: { mode: 'mock' },
      };
    }

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: ctx.email,
        amount: ctx.amount * 100,
        reference: ctx.reference,
        callback_url: ctx.callbackUrl,
        metadata: { firstName: ctx.firstName, lastName: ctx.lastName },
      }),
    });
    const body = (await res.json()) as {
      status: boolean;
      data?: { authorization_url: string; reference: string };
      message?: string;
    };
    if (!body.status || !body.data) {
      throw new Error(body.message ?? 'Paystack initialize failed');
    }
    return {
      externalReference: body.data.reference,
      authorizationUrl: body.data.authorization_url,
      publicKey,
    };
  }

  extractCallbackReference(payload: unknown): string | null {
    const body = payload as { data?: { reference?: string }; reference?: string };
    return body?.data?.reference ?? body?.reference ?? null;
  }

  parseCallback(
    payload: unknown,
    headers?: Record<string, string>,
  ): CallbackOutcome {
    const secret = this.config.get('paystack.secretKey', { infer: true });
    const raw = JSON.stringify(payload);
    if (secret && headers?.['x-paystack-signature']) {
      const expected = createHmac('sha256', secret).update(raw).digest('hex');
      if (expected !== headers['x-paystack-signature']) {
        return {
          externalReference: this.extractCallbackReference(payload) ?? '',
          status: TransactionStatus.FAILED,
        };
      }
    }
    const body = payload as {
      event?: string;
      data?: { reference?: string; status?: string };
    };
    const reference = this.extractCallbackReference(payload) ?? '';
    const paid =
      body.event === 'charge.success' || body.data?.status === 'success';
    return {
      externalReference: reference,
      status: paid ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
      receiptNumber: reference,
    };
  }
}
