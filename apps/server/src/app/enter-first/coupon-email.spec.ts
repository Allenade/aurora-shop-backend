import { isPersonalCoupon, normalizeCouponEmail } from './coupon-email';

describe('coupon email rules', () => {
  it('normalizes and lowercases a valid email', () => {
    expect(normalizeCouponEmail('  Ada@Gmail.com ')).toBe('ada@gmail.com');
  });

  it('rejects a missing or invalid email', () => {
    expect(normalizeCouponEmail('')).toBeNull();
    expect(normalizeCouponEmail('not-an-email')).toBeNull();
  });

  it('treats free and 100 percent as personal', () => {
    expect(isPersonalCoupon('free', null)).toBe(true);
    expect(isPersonalCoupon('discount_percent', 100)).toBe(true);
    expect(isPersonalCoupon('discount_percent', 20)).toBe(false);
    expect(isPersonalCoupon('discount_fixed', 100)).toBe(false);
  });
});
