import { Injectable, Logger } from '@nestjs/common';
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
import { verifyPaystackSignature } from './paystack-signature';
import { parsePaystackTransaction } from './reconcile-charge';

type PaystackEnvelope = {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    reference?: string;
    id?: number | string;
    status?: string;
    amount?: number;
    currency?: string;
    channel?: string;
  };
  event?: string;
};

@Injectable()
export class PaystackProvider implements PaymentProvider {
  readonly id = TransactionProvider.PAYSTACK;
  private readonly logger = new Logger(PaystackProvider.name);

  constructor(private readonly config: ConfigService<EnvTypes, true>) {}

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
    const body = (await res.json()) as PaystackEnvelope;
    if (!body.status || !body.data?.authorization_url) {
      throw new Error(body.message ?? 'Paystack initialize failed');
    }
    return {
      externalReference: body.data.reference ?? ctx.reference,
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

  parseCallback(
    payload: unknown,
    headers?: Record<string, string>,
    rawBody?: Buffer | string,
  ): CallbackOutcome {
    const secret = this.secret();
    const reference = this.extractCallbackReference(payload) ?? '';
    if (!secret) {
      this.assertMockAllowed();
      this.logger.warn(
        'Ignoring Paystack webhook because PAYSTACK_SECRET_KEY is not set',
      );
      return {
        externalReference: reference,
        status: TransactionStatus.PENDING,
        signatureValid: false,
      };
    }

    const signature =
      headers?.['x-paystack-signature'] ?? headers?.['X-Paystack-Signature'];
    if (!verifyPaystackSignature(rawBody, signature, secret)) {
      this.logger.warn('Rejected Paystack webhook: signature mismatch');
      return {
        externalReference: reference,
        status: TransactionStatus.PENDING,
        signatureValid: false,
      };
    }

    const body = payload as PaystackEnvelope;
    const parsed = parsePaystackTransaction(body.data ?? {});
    const paid =
      body.event === 'charge.success' ||
      parsed.status === TransactionStatus.SUCCESS;
    const failed =
      body.event === 'charge.failed' ||
      parsed.status === TransactionStatus.FAILED;
    return {
      externalReference: parsed.reference || reference,
      status: paid
        ? TransactionStatus.SUCCESS
        : failed
          ? TransactionStatus.FAILED
          : TransactionStatus.PENDING,
      receiptNumber: parsed.reference || reference,
      charge: parsed.charge,
      signatureValid: true,
    };
  }

  async verifyReference(
    reference: string,
    expected?: { amount: number; currency: string },
  ): Promise<CallbackOutcome> {
    const secret = this.secret();
    if (!secret) {
      this.assertMockAllowed();
      return {
        externalReference: reference,
        status: TransactionStatus.SUCCESS,
        receiptNumber: reference,
        metadata: { mode: 'mock' },
        signatureValid: true,
        charge: {
          transactionId: `mock-${reference}`,
          paidAmount: expected?.amount,
          currency: expected?.currency ?? 'NGN',
          channel: 'mock',
        },
      };
    }

    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const body = (await res.json()) as PaystackEnvelope;
    const parsed = parsePaystackTransaction({
      ...body.data,
      reference: body.data?.reference ?? reference,
    });
    return {
      externalReference: parsed.reference || reference,
      status: parsed.status,
      receiptNumber: parsed.reference || reference,
      charge: parsed.charge,
      signatureValid: true,
    };
  }

  async refund(input: {
    transactionId?: string;
    reference?: string;
    amountNaira?: number;
  }): Promise<{ id: string; status: string }> {
    const secret = this.secret();
    const transaction = input.transactionId || input.reference;
    if (!transaction) {
      throw new Error('Paystack refund requires a transaction id or reference');
    }
    if (!secret) {
      this.assertMockAllowed();
      return { id: `mock-refund-${transaction}`, status: 'processed' };
    }

    const payload: Record<string, unknown> = { transaction };
    if (input.amountNaira && input.amountNaira > 0) {
      payload.amount = input.amountNaira * 100;
    }
    const res = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {
      status?: boolean;
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

  private secret() {
    return this.config.get('paystack.secretKey', { infer: true });
  }

  /** Mock initialize/verify is development-only. Production startup already requires the key. */
  private assertMockAllowed() {
    if (this.config.get('nodeEnv', { infer: true }) === 'production') {
      throw new Error('PAYSTACK_SECRET_KEY must be set in production');
    }
  }
}
