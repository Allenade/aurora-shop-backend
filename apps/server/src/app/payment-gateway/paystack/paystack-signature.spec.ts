import { createHmac } from 'crypto';
import { verifyPaystackSignature } from './paystack-signature';

describe('Paystack webhook signature', () => {
  const secret = 'sk_test_secret';
  const raw = Buffer.from(
    '{"event":"charge.success","data":{"amount":1500000}}',
  );

  it('accepts an HMAC-SHA512 of the raw body', () => {
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(true);
  });

  it('rejects a signature computed from a re-serialized body', () => {
    const reserialized = JSON.stringify(JSON.parse(raw.toString('utf8')));
    const signature = createHmac('sha512', secret)
      .update(reserialized + ' ')
      .digest('hex');
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(false);
  });

  it('rejects a missing signature or secret', () => {
    expect(verifyPaystackSignature(raw, undefined, secret)).toBe(false);
    expect(verifyPaystackSignature(raw, 'abc', '')).toBe(false);
    expect(verifyPaystackSignature(undefined, 'abc', secret)).toBe(false);
  });
});
