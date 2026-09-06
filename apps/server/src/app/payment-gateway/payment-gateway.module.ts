import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDERS_TOKEN } from './_contract/payment-provider.registry';
import { PaymentProviderRegistry } from './_contract/payment-provider.registry';
import { BankTransferProvider } from './bank/bank-transfer.provider';
import { PaystackProvider } from './paystack/paystack.provider';

@Module({
  providers: [
    PaystackProvider,
    BankTransferProvider,
    {
      provide: PAYMENT_PROVIDERS_TOKEN,
      useFactory: (paystack: PaystackProvider, bank: BankTransferProvider) => [
        paystack,
        bank,
      ],
      inject: [PaystackProvider, BankTransferProvider],
    },
    PaymentProviderRegistry,
  ],
  exports: [PaymentProviderRegistry],
})
export class PaymentGatewayModule {}
