import type { CallbackOutcome } from '../payment-gateway/_contract/payment.types';
import {
  TransactionProvider,
  TransactionStatus,
} from '../payment-gateway/_contract/payment.types';
import type { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';

/** Poll Paystack for the latest status of a reference. Legacy bank rows stay pending. */
export function pollProviderPaymentStatus(
  provider: TransactionProvider,
  reference: string,
  adapters: {
    paystack: PaystackProvider;
  },
): Promise<CallbackOutcome> {
  if (provider === TransactionProvider.PAYSTACK) {
    return adapters.paystack.verifyReference(reference);
  }
  return Promise.resolve({
    externalReference: reference,
    status: TransactionStatus.PENDING,
    metadata: { legacyProvider: provider },
  });
}
