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
import { koboToMajor } from './charge-match';
import { verifyPaystackSignature } from './paystack-signature';

type PaystackCharge = {
  id?: number | string;
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  channel?: string;
};

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly id = TransactionProvider.PAYSTACK;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {}

  private secret(): string {
    return this.config.get('paystack.secretKey', { infer: true });
  }

  private assertMockAllowed() {
    if (this.config.get('nodeEnv', { infer: true }) === 'production') {
      throw new Error('PAYSTACK_SECRET_KEY must be set in production');
    }
  }

  async register(ctx: RegisterContext): Promise<RegisterResult> {
    const secret = this.secret();
    const publicKey = this.config.get('paystack.publicKey', { infer: true });
    if (!secret) {
      this.assertMockAllowed();
      const separator = ctx.callbackUrl.includes('?') ? '&' : '?';
      return {
        externalReference: ctx.reference,
        authorizationUrl: `${ctx.callbackUrl}${separator}reference=${encodeURIComponent(ctx.reference)}&mock=1`,
        publicKey,
        metadata: { mode: 'mock', channels: ctx.channels ?? [] },
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
        currency: 'NGN',
        reference: ctx.reference,
        callback_url: ctx.callbackUrl,
        channels: ctx.channels,
        metadata: {
          firstName: ctx.firstName,
          lastName: ctx.lastName,
          ...(ctx.metadata ?? {}),
        },
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
      metadata: { channels: ctx.channels ?? [] },
    };
  }

  extractCallbackReference(payload: unknown): string | null {
    const body = payload as {
      data?: { reference?: string };
      reference?: string;
    };
    return body?.data?.reference ?? body?.reference ?? null;
  }

  /**
   * Webhooks are accepted only after {@link verifyPaystackSignature} on the raw body.
   * This parser does not trust a JSON re-serialization and does not run when the signature fails.
   */
  parseVerifiedPayload(rawBody: Buffer): CallbackOutcome {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event?: string;
      data?: PaystackCharge;
    };
    const data = body.data;
    const reference = data?.reference ?? '';
    const outcome: CallbackOutcome = {
      externalReference: reference,
      receiptNumber: reference,
      status: TransactionStatus.PENDING,
      paystackTransactionId: data?.id != null ? String(data.id) : undefined,
      amount:
        typeof data?.amount === 'number' ? koboToMajor(data.amount) : undefined,
      currency: data?.currency,
      channel: data?.channel,
    };
    if (
      body.event === 'charge.success' &&
      (data?.status === 'success' || data?.status == null)
    ) {
      outcome.status = TransactionStatus.SUCCESS;
    } else if (body.event === 'charge.failed' || data?.status === 'failed') {
      outcome.status = TransactionStatus.FAILED;
    }
    return outcome;
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    return verifyPaystackSignature(rawBody, signature, this.secret());
  }

  parseCallback(
    payload: unknown,
    headers?: Record<string, string>,
  ): CallbackOutcome {
    const raw = headers?.['x-raw-body'];
    const signature = headers?.['x-paystack-signature'];
    if (!raw || !this.verifySignature(Buffer.from(raw), signature)) {
      return {
        externalReference: this.extractCallbackReference(payload) ?? '',
        status: TransactionStatus.PENDING,
        metadata: { rejected: 'invalid_signature' },
      };
    }
    return this.parseVerifiedPayload(Buffer.from(raw));
  }

  async verifyReference(reference: string): Promise<CallbackOutcome> {
    const secret = this.secret();
    if (!secret) {
      this.assertMockAllowed();
      return {
        externalReference: reference,
        status: TransactionStatus.SUCCESS,
        receiptNumber: reference,
        metadata: { mode: 'mock' },
      };
    }

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const body = (await res.json()) as {
      status: boolean;
      data?: PaystackCharge;
    };
    return this.toOutcome(body.data, { fallbackReference: reference });
  }

  async refund(transaction: string): Promise<{ id: string; status: string }> {
    const secret = this.secret();
    if (!secret) {
      this.assertMockAllowed();
      return { id: `mock_rf_${transaction}`, status: 'processed' };
    }
    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction }),
    });
    const body = (await res.json()) as {
      status: boolean;
      message?: string;
      data?: { id?: number | string; status?: string };
    };
    if (!body.status || !body.data) {
      throw new Error(body.message ?? 'Paystack refund failed');
    }
    return {
      id: String(body.data.id ?? ''),
      status: body.data.status ?? 'pending',
    };
  }

  private toOutcome(
    data: PaystackCharge | undefined,
    opts: { paidHint?: boolean; fallbackReference?: string },
  ): CallbackOutcome {
    const reference = data?.reference ?? opts.fallbackReference ?? '';
    const state = data?.status;
    const paid = opts.paidHint === true || state === 'success';
    const failed = state === 'failed' || state === 'abandoned';
    return {
      externalReference: reference,
      status: paid
        ? TransactionStatus.SUCCESS
        : failed
          ? TransactionStatus.FAILED
          : TransactionStatus.PENDING,
      receiptNumber: reference,
      paystackTransactionId: data?.id != null ? String(data.id) : undefined,
      amount:
        typeof data?.amount === 'number' ? koboToMajor(data.amount) : undefined,
      currency: data?.currency,
      channel: data?.channel,
    };
  }
}
