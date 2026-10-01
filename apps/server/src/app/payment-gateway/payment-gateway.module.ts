import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDERS_TOKEN } from './_contract/payment-provider.registry';
import { PaymentProviderRegistry } from './_contract/payment-provider.registry';
import { PaystackProvider } from './paystack/paystack.provider';

@Module({
  providers: [
    PaystackProvider,
    {
      provide: PAYMENT_PROVIDERS_TOKEN,
      useFactory: (paystack: PaystackProvider) => [paystack],
      inject: [PaystackProvider],
    },
    PaymentProviderRegistry,
  ],
  exports: [PaymentProviderRegistry, PaystackProvider],
})
export class PaymentGatewayModule {}
