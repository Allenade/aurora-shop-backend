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

export type RegisterContext = {
  amount: number;
  reference: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Paystack checkout channels. Bank transfer uses `bank_transfer`. */
  channels?: string[];
};

/** How an enrollment or shop payment status was confirmed. */
export type ConfirmationSource = 'webhook' | 'poll' | 'admin';

export type ChargeDetails = {
  transactionId?: string;
  /** Major units (naira), converted from Paystack kobo. */
  paidAmount?: number;
  currency?: string;
  channel?: string;
  amountMatches?: boolean;
  currencyMatches?: boolean;
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
  charge?: ChargeDetails;
  /**
   * False when the webhook HMAC was missing or did not match the raw body.
   * Callers must not apply a payload in that case.
   */
  signatureValid?: boolean;
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
    rawBody?: Buffer | string,
  ): Promise<CallbackOutcome> | CallbackOutcome;
  /** Ask the provider for the current state of a reference. */
  verifyReference(
    reference: string,
    expected?: { amount: number; currency: string },
  ): Promise<CallbackOutcome>;
  refund?(input: {
    transactionId?: string;
    reference?: string;
    amountNaira?: number;
  }): Promise<{ id: string; status: string }>;
}
