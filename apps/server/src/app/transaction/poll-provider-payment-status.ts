import type { CallbackOutcome } from '../payment-gateway/_contract/payment.types';
import {
  TransactionProvider,
  TransactionStatus,
} from '../payment-gateway/_contract/payment.types';
import type { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';

/** Poll Paystack for the latest status of a reference. */
export function pollProviderPaymentStatus(
  provider: TransactionProvider,
  reference: string,
  adapters: {
    paystack: PaystackProvider;
  },
  expected?: { amount: number; currency: string },
): Promise<CallbackOutcome> {
  if (provider === TransactionProvider.BANK) {
    return Promise.resolve({
      externalReference: reference,
      status: TransactionStatus.PENDING,
      metadata: {
        reason:
          'Manual bank transfer was removed. Collect via Paystack Pay with Transfer.',
      },
      signatureValid: true,
    });
  }
  return adapters.paystack.verifyReference(reference, expected);
}
