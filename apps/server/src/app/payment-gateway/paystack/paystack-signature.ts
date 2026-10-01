import { createHmac, timingSafeEqual } from 'crypto';

/** True when this build verifies Paystack webhooks over the raw body. */
export const PAYSTACK_WEBHOOK_USES_RAW_BODY = true;

/**
 * HMAC-SHA512 of the exact webhook bytes, compared in constant time.
 * A missing secret never accepts a payload.
 */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!signature || !secret) return false;
  const digest = createHmac('sha512', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(signature);
  const expected = Buffer.from(digest);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
