import { applyInviteToQuote } from './invite-pricing';
import type { QuoteLine } from '../course/course-pricing';

const lines = (prices: Array<[string, number]>): QuoteLine[] =>
  prices.map(([slug, price]) => ({
    slug,
    name: slug,
    price,
    currency: 'NGN',
    isFree: price === 0,
    enrollmentCutoff: null,
  }));

describe('applyInviteToQuote', () => {
  it('makes all tracks free', () => {
    const quote = {
      amount: 120_000,
      currency: 'NGN',
      lines: lines([
        ['iot', 60_000],
        ['mobile', 60_000],
      ]),
    };
    const result = applyInviteToQuote(quote, {
      offerType: 'free',
      trackScope: 'all',
      trackSlugs: [],
    });
    expect(result.amount).toBe(0);
    expect(result.pricingType).toBe('free');
    expect(result.listAmount).toBe(120_000);
  });

  it('makes only selected tracks free', () => {
    const quote = {
      amount: 120_000,
      currency: 'NGN',
      lines: lines([
        ['iot', 60_000],
        ['mobile', 60_000],
      ]),
    };
    const result = applyInviteToQuote(quote, {
      offerType: 'free',
      trackScope: 'selected',
      trackSlugs: ['iot'],
    });
    expect(result.amount).toBe(60_000);
    expect(result.pricingType).toBe('discount');
    expect(result.lines.find((l) => l.slug === 'iot')?.price).toBe(0);
  });

  it('applies percent discount to covered tracks', () => {
    const quote = {
      amount: 60_000,
      currency: 'NGN',
      lines: lines([['iot', 60_000]]),
    };
    const result = applyInviteToQuote(quote, {
      offerType: 'discount_percent',
      discountPercent: 20,
      trackScope: 'all',
      trackSlugs: [],
    });
    expect(result.amount).toBe(48_000);
    expect(result.pricingType).toBe('discount');
    expect(result.discountLabel).toBe('20% off');
  });

  it('applies fixed discount across covered tracks', () => {
    const quote = {
      amount: 120_000,
      currency: 'NGN',
      lines: lines([
        ['iot', 60_000],
        ['mobile', 60_000],
      ]),
    };
    const result = applyInviteToQuote(quote, {
      offerType: 'discount_fixed',
      discountAmount: 70_000,
      trackScope: 'all',
      trackSlugs: [],
    });
    expect(result.amount).toBe(50_000);
    expect(result.pricingType).toBe('discount');
  });
});
