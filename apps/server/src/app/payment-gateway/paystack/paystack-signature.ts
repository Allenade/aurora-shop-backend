import { createHmac, timingSafeEqual } from 'crypto';

/** HMAC-SHA512 hex digest of the exact raw webhook body. */
export function paystackSignatureHex(
  rawBody: Buffer | string,
  secret: string,
): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

/**
 * Constant-time check of `x-paystack-signature` against the raw body.
 * A missing body, header, or secret is a failed check — never a pass.
 */
export function verifyPaystackSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = paystackSignatureHex(rawBody, secret);
  const actual = signature.trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
