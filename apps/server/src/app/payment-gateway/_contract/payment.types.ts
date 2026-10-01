export enum TransactionProvider {
  PAYSTACK = 'paystack',
  BANK = 'bank',
}

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum TransactionReason {
  ORDER = 'order',
}

export type PaymentConfirmationSource = 'webhook' | 'poll' | 'admin';

export type RegisterContext = {
  amount: number;
  reference: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  callbackUrl: string;
  /** Paystack checkout channels. Bank transfer is `bank_transfer` (Pay with Transfer). */
  channels?: string[];
  metadata?: Record<string, unknown>;
};

export type RegisterResult = {
  externalReference?: string;
  redirectUrl?: string;
  authorizationUrl?: string;
  publicKey?: string;
  bank?: {
    bank: string;
    accountName: string;
    accountNumber: string;
  };
  metadata?: Record<string, unknown>;
};

export type CallbackOutcome = {
  externalReference: string;
  status: TransactionStatus;
  receiptNumber?: string;
  metadata?: Record<string, unknown>;
  /** Paystack transaction id (numeric id as string). */
  paystackTransactionId?: string;
  /** Amount actually charged, in major units (naira). */
  amount?: number;
  currency?: string;
  channel?: string;
  confirmedVia?: PaymentConfirmationSource;
};

export interface PaymentProvider {
  readonly id: TransactionProvider;
  register(ctx: RegisterContext): Promise<RegisterResult>;
  extractCallbackReference(
    payload: unknown,
    headers?: Record<string, string>,
  ): string | null;
  parseCallback(
    payload: unknown,
    headers?: Record<string, string>,
  ): Promise<CallbackOutcome> | CallbackOutcome;
  /** Ask the provider for the current state of a reference. */
  verifyReference(reference: string): Promise<CallbackOutcome>;
}
