import { evaluateCharge, koboToMajor } from './charge-match';

describe('evaluateCharge', () => {
  it('matches amount and currency', () => {
    expect(
      evaluateCharge(
        { amount: 60_000, currency: 'NGN' },
        { amount: 60_000, currency: 'ngn' },
      ),
    ).toBe('match');
  });

  it('flags an undercharge', () => {
    expect(
      evaluateCharge(
        { amount: 60_000, currency: 'NGN' },
        { amount: 1_000, currency: 'NGN' },
      ),
    ).toBe('mismatch');
  });

  it('flags a missing amount on a live charge', () => {
    expect(
      evaluateCharge({ amount: 60_000, currency: 'NGN' }, { currency: 'NGN' }),
    ).toBe('mismatch');
  });

  it('allows mock mode without a captured amount', () => {
    expect(
      evaluateCharge({ amount: 60_000, currency: 'NGN' }, { mock: true }),
    ).toBe('match');
  });
});

describe('koboToMajor', () => {
  it('converts Paystack kobo to naira', () => {
    expect(koboToMajor(6_000_000)).toBe(60_000);
  });
});
