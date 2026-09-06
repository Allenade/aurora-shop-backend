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
}
