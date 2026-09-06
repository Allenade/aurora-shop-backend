import { Inject, Injectable } from '@nestjs/common';
import {
  type PaymentProvider,
  TransactionProvider,
} from './payment.types';

export const PAYMENT_PROVIDERS_TOKEN = 'PAYMENT_PROVIDERS';

@Injectable()
export class PaymentProviderRegistry {
  private readonly map = new Map<TransactionProvider, PaymentProvider>();

  constructor(
    @Inject(PAYMENT_PROVIDERS_TOKEN)
    providers: PaymentProvider[],
  ) {
    for (const provider of providers) {
      this.map.set(provider.id, provider);
    }
  }

  get(id: TransactionProvider): PaymentProvider {
    const provider = this.map.get(id);
    if (!provider) {
      throw new Error(`Unknown payment provider: ${id}`);
    }
    return provider;
  }
}
