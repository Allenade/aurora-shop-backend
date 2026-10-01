import { createHmac, timingSafeEqual } from 'crypto';

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, '+').replace(/_/g, '/') + pad,
    'base64',
  );
}

export function signUnsubscribe(
  email: string,
  secret: string,
  expSeconds: number,
): string {
  const payload = b64url(`${email.toLowerCase()}|${expSeconds}`);
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyUnsubscribe(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = b64url(
    createHmac('sha256', secret).update(payload).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const decoded = fromB64url(payload).toString('utf8');
  const splitAt = decoded.lastIndexOf('|');
  if (splitAt < 0) return null;
  const email = decoded.slice(0, splitAt);
  const exp = Number(decoded.slice(splitAt + 1));
  if (!email || !Number.isFinite(exp) || exp < nowSeconds) return null;
  return email;
}
