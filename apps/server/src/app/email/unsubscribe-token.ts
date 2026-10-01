import { createHmac, timingSafeEqual } from 'crypto';

export function signUnsubscribeToken(email: string, secret: string): string {
  const payload = Buffer.from(email.trim().toLowerCase(), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readUnsubscribeToken(
  token: string,
  secret: string,
): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(payload, 'base64url')
    .toString('utf8')
    .trim()
    .toLowerCase();
}
