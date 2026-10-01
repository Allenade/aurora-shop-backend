import { createHmac } from 'crypto';
import { verifyPaystackSignature } from './paystack-signature';

describe('verifyPaystackSignature', () => {
  const secret = 'sk_test_secret';
  const raw = Buffer.from(
    '{"event":"charge.success","data":{"reference":"EF-1","amount":6000000}}',
  );

  it('accepts an HMAC-SHA512 of the raw body', () => {
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(true);
  });

  it('rejects a signature computed from a re-serialized body', () => {
    const reordered = JSON.stringify(JSON.parse(raw.toString('utf8')));
    const signature = createHmac('sha512', secret)
      .update(reordered)
      .digest('hex');
    const swapped = Buffer.from(
      raw.toString('utf8').replace('charge.success', 'charge.failed'),
    );
    expect(verifyPaystackSignature(swapped, signature, secret)).toBe(false);
  });

  it('rejects a missing secret or signature', () => {
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    expect(verifyPaystackSignature(raw, signature, '')).toBe(false);
    expect(verifyPaystackSignature(raw, undefined, secret)).toBe(false);
  });
});
