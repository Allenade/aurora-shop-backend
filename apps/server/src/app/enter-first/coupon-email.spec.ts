import {
  MAX_COUPON_EMAILS,
  allowedEmailsFromInvite,
  normalizeCouponEmail,
  parseCouponEmails,
} from './coupon-email';

describe('coupon email rules', () => {
  it('normalizes and lowercases a valid email', () => {
    expect(normalizeCouponEmail('  Ada@Gmail.com ')).toBe('ada@gmail.com');
  });

  it('rejects a missing or invalid email', () => {
    expect(normalizeCouponEmail('')).toBeNull();
    expect(normalizeCouponEmail('not-an-email')).toBeNull();
  });

  it('parses a shared coupon with no emails', () => {
    expect(parseCouponEmails('', [])).toEqual({ ok: true, emails: [] });
    expect(parseCouponEmails(undefined, undefined)).toEqual({
      ok: true,
      emails: [],
    });
  });

  it('parses comma and newline lists and drops duplicates', () => {
    expect(
      parseCouponEmails('Ada@Gmail.com, bola@example.com\nADA@gmail.com'),
    ).toEqual({
      ok: true,
      emails: ['ada@gmail.com', 'bola@example.com'],
    });
  });

  it('merges an array with a pasted string', () => {
    expect(
      parseCouponEmails('chi@example.com', [
        'Ada@Gmail.com',
        'chi@example.com',
      ]),
    ).toEqual({
      ok: true,
      emails: ['ada@gmail.com', 'chi@example.com'],
    });
  });

  it('rejects an invalid token in a list', () => {
    expect(parseCouponEmails('ada@example.com, not-an-email')).toEqual({
      ok: false,
      invalid: 'not-an-email',
    });
  });

  it('caps the list size', () => {
    const list = Array.from(
      { length: MAX_COUPON_EMAILS + 1 },
      (_, i) => `user${i}@example.com`,
    );
    expect(parseCouponEmails(undefined, list).ok).toBe(false);
  });

  it('reads stored emails from an invite row', () => {
    expect(allowedEmailsFromInvite({ allowedEmails: null })).toEqual([]);
    expect(
      allowedEmailsFromInvite({
        allowedEmails: ['ada@example.com', ''],
      }),
    ).toEqual(['ada@example.com']);
  });
});
