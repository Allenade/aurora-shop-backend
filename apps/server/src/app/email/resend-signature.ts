import { createHmac, timingSafeEqual } from 'crypto';

function decodeSecret(secret: string): Buffer {
  const trimmed = secret.startsWith('whsec_')
    ? secret.slice('whsec_'.length)
    : secret;
  return Buffer.from(trimmed, 'base64');
}

/** Svix signature used by Resend webhooks, over the raw body. */
export function verifyResendSignature(input: {
  rawBody: Buffer;
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret } = input;
  if (!svixId || !svixTimestamp || !svixSignature || !secret) return false;
  const timestamp = Number(svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 5 * 60) return false;
  const signed = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', decodeSecret(secret))
    .update(signed)
    .digest('base64');
  return svixSignature.split(' ').some((part) => {
    const value = part.startsWith('v1,') ? part.slice(3) : part;
    const actual = Buffer.from(value);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length) return false;
    return timingSafeEqual(actual, wanted);
  });
}
