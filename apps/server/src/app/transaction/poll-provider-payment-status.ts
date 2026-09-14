import type { CallbackOutcome } from '../payment-gateway/_contract/payment.types';
import { TransactionProvider } from '../payment-gateway/_contract/payment.types';
import type { BankTransferProvider } from '../payment-gateway/bank/bank-transfer.provider';
import type { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';

/** Poll the concrete payment adapter for the latest status of a reference. */
export function pollProviderPaymentStatus(
  provider: TransactionProvider,
  reference: string,
  adapters: {
    paystack: PaystackProvider;
    bank: BankTransferProvider;
  },
): Promise<CallbackOutcome> {
  if (provider === TransactionProvider.PAYSTACK) {
    return adapters.paystack.verifyReference(reference);
  }
  return adapters.bank.verifyReference(reference);
}
