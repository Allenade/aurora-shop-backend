import { escapeHtml, renderEmail } from './email-render';
import {
  batchIdempotencyKey,
  chunkIds,
  idempotencyKeyForMessage,
  includeRecipient,
  retryDelayMs,
} from './email-queue.policy';
import { mapResendEvent, verifyResendWebhook } from './resend-webhook';
import { createHmac } from 'crypto';

describe('email queue policy', () => {
  it('retries with exponential backoff and stops after 5 attempts', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(4)).toBe(240_000);
    expect(retryDelayMs(5)).toBeNull();
  });

  it('never batches more than 100 messages', () => {
    const chunks = chunkIds(
      Array.from({ length: 250 }, (_, i) => i),
      500,
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });

  it('keeps a stable idempotency key per message', () => {
    expect(idempotencyKeyForMessage('abc')).toBe('ef-email-abc');
    expect(batchIdempotencyKey(['b', 'a'])).toBe(
      batchIdempotencyKey(['a', 'b']),
    );
  });

  it('requires marketing opt-in and honours suppressions', () => {
    expect(
      includeRecipient({ kind: 'marketing', marketingOptIn: false }).include,
    ).toBe(false);
    expect(
      includeRecipient({
        kind: 'marketing',
        marketingOptIn: true,
        suppression: 'unsubscribe',
      }).include,
    ).toBe(false);
    expect(
      includeRecipient({
        kind: 'transactional',
        marketingOptIn: false,
        suppression: 'unsubscribe',
      }).include,
    ).toBe(true);
    expect(
      includeRecipient({
        kind: 'transactional',
        marketingOptIn: true,
        suppression: 'hard_bounce',
      }).include,
    ).toBe(false);
  });

  it('escapes enrollee values inside HTML', () => {
    const rendered = renderEmail({
      subject: 'Hi {{firstName}}',
      html: '<p>{{firstName}}</p><p>{{amount}}</p>',
      kind: 'transactional',
      vars: {
        firstName: '<script>alert(1)</script>',
        amount: 'NGN 60000',
      },
    });
    expect(rendered.html).toContain(escapeHtml('<script>alert(1)</script>'));
    expect(rendered.html).not.toContain('<script>alert');
    expect(rendered.subject).not.toContain('<');
  });
});

describe('Resend webhook', () => {
  it('verifies the Svix signature over the raw body', () => {
    const secretBytes = Buffer.from('super-secret-key');
    const secret = `whsec_${secretBytes.toString('base64')}`;
    const raw = '{"type":"email.bounced"}';
    const id = 'msg_1';
    const timestamp = '1700000000';
    const signature = createHmac('sha256', secretBytes)
      .update(`${id}.${timestamp}.${raw}`)
      .digest('base64');
    expect(
      verifyResendWebhook({
        rawBody: raw,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: `v1,${signature}`,
        secret,
        nowMs: 1_700_000_000_000,
      }),
    ).toBe(true);
    expect(
      verifyResendWebhook({
        rawBody: raw + ' ',
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: `v1,${signature}`,
        secret,
        nowMs: 1_700_000_000_000,
      }),
    ).toBe(false);
  });

  it('suppresses hard bounces and complaints', () => {
    expect(mapResendEvent('email.bounced', 'Permanent')?.suppress).toBe(
      'hard_bounce',
    );
    expect(
      mapResendEvent('email.bounced', 'Temporary')?.suppress,
    ).toBeUndefined();
    expect(mapResendEvent('email.complained')?.suppress).toBe('complaint');
    expect(mapResendEvent('email.delivered')?.status).toBe('delivered');
  });
});
