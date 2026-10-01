import { createHmac, timingSafeEqual } from 'crypto';

export function verifyResendWebhook(input: {
  rawBody: Buffer | string;
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
  secret?: string;
  nowMs?: number;
  toleranceSec?: number;
}): boolean {
  const { rawBody, svixId, svixTimestamp, svixSignature, secret } = input;
  if (!rawBody || !svixId || !svixTimestamp || !svixSignature || !secret) {
    return false;
  }
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > (input.toleranceSec ?? 5 * 60)) return false;

  const encoded = secret.startsWith('whsec_')
    ? secret.slice('whsec_'.length)
    : secret;
  const key = Buffer.from(encoded, 'base64');
  if (!key.length) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest('base64');

  return svixSignature.split(' ').some((part) => {
    const value = part.trim().replace(/^v1,/, '');
    const a = Buffer.from(expected);
    const b = Buffer.from(value);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  });
}

export type ResendDeliveryUpdate = {
  status: 'delivered' | 'opened' | 'bounced' | 'failed' | 'complained';
  suppress?: 'hard_bounce' | 'complaint';
};

export function mapResendEvent(
  event: string,
  bounceType?: string,
): ResendDeliveryUpdate | null {
  switch (event) {
    case 'email.delivered':
      return { status: 'delivered' };
    case 'email.opened':
    case 'email.clicked':
      return { status: 'opened' };
    case 'email.bounced': {
      const hard = ['permanent', 'hard', 'hardbounce', 'hard_bounce'].includes(
        (bounceType ?? '').toLowerCase(),
      );
      return hard
        ? { status: 'bounced', suppress: 'hard_bounce' }
        : { status: 'bounced' };
    }
    case 'email.complained':
      return { status: 'complained', suppress: 'complaint' };
    case 'email.failed':
      return { status: 'failed' };
    default:
      return null;
  }
}
