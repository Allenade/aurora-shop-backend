import {
  TransactionStatus,
  type ChargeDetails,
} from '../_contract/payment.types';

export type PaystackTransactionData = {
  id?: number | string;
  reference?: string;
  status?: string;
  /** Paystack amount in kobo (minor units). */
  amount?: number;
  currency?: string;
  channel?: string;
};

/** Map a Paystack transaction object into a status plus major-unit charge. */
export function parsePaystackTransaction(data: PaystackTransactionData): {
  status: TransactionStatus;
  reference: string;
  charge: ChargeDetails;
} {
  const status =
    data.status === 'success'
      ? TransactionStatus.SUCCESS
      : data.status === 'failed'
        ? TransactionStatus.FAILED
        : TransactionStatus.PENDING;
  return {
    status,
    reference: data.reference ?? '',
    charge: {
      transactionId: data.id != null ? String(data.id) : undefined,
      paidAmount:
        typeof data.amount === 'number'
          ? Math.round(data.amount / 100)
          : undefined,
      currency: data.currency,
      channel: data.channel,
    },
  };
}

/**
 * A provider "success" is only accepted when the amount and currency that
 * were actually charged match what we expected to collect.
 */
export function reconcileProviderStatus(input: {
  providerStatus: TransactionStatus;
  charge?: ChargeDetails;
  expectedAmount: number;
  expectedCurrency: string;
}): {
  status: TransactionStatus;
  amountMatches: boolean;
  currencyMatches: boolean;
  charge: ChargeDetails;
} {
  const paidAmount = input.charge?.paidAmount;
  const currency = input.charge?.currency;
  const checking = input.providerStatus === TransactionStatus.SUCCESS;
  const amountMatches = checking
    ? typeof paidAmount === 'number' && paidAmount === input.expectedAmount
    : true;
  const currencyMatches = checking
    ? typeof currency === 'string' &&
      currency.toUpperCase() === input.expectedCurrency.toUpperCase()
    : true;

  const status =
    checking && (!amountMatches || !currencyMatches)
      ? TransactionStatus.PENDING
      : input.providerStatus;

  return {
    status,
    amountMatches,
    currencyMatches,
    charge: {
      ...input.charge,
      amountMatches,
      currencyMatches,
    },
  };
}
