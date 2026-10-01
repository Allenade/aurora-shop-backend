import { TransactionStatus } from '../_contract/payment.types';
import {
  parsePaystackTransaction,
  reconcileProviderStatus,
} from './reconcile-charge';

describe('Paystack amount verification', () => {
  it('converts kobo to naira', () => {
    const parsed = parsePaystackTransaction({
      id: 99,
      reference: 'EF-1',
      status: 'success',
      amount: 6_000_000,
      currency: 'NGN',
      channel: 'bank_transfer',
    });
    expect(parsed.charge.paidAmount).toBe(60_000);
    expect(parsed.charge.channel).toBe('bank_transfer');
    expect(parsed.status).toBe(TransactionStatus.SUCCESS);
  });

  it('accepts a success only when amount and currency match', () => {
    const parsed = parsePaystackTransaction({
      status: 'success',
      amount: 6_000_000,
      currency: 'NGN',
    });
    const ok = reconcileProviderStatus({
      providerStatus: parsed.status,
      charge: parsed.charge,
      expectedAmount: 60_000,
      expectedCurrency: 'NGN',
    });
    expect(ok.status).toBe(TransactionStatus.SUCCESS);
    expect(ok.amountMatches).toBe(true);
  });

  it('does not treat an underpayment as paid', () => {
    const decision = reconcileProviderStatus({
      providerStatus: TransactionStatus.SUCCESS,
      charge: { paidAmount: 1000, currency: 'NGN', transactionId: '1' },
      expectedAmount: 60_000,
      expectedCurrency: 'NGN',
    });
    expect(decision.status).toBe(TransactionStatus.PENDING);
    expect(decision.amountMatches).toBe(false);
  });

  it('does not treat a different currency as paid', () => {
    const decision = reconcileProviderStatus({
      providerStatus: TransactionStatus.SUCCESS,
      charge: { paidAmount: 60_000, currency: 'USD' },
      expectedAmount: 60_000,
      expectedCurrency: 'NGN',
    });
    expect(decision.status).toBe(TransactionStatus.PENDING);
    expect(decision.currencyMatches).toBe(false);
  });
});
