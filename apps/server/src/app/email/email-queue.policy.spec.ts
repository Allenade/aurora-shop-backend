import {
  EMAIL_BATCH_SIZE,
  EMAIL_MAX_ATTEMPTS,
  backoffMs,
  batchIdempotencyKey,
  chunk,
} from './email-queue.policy';

describe('email queue policy', () => {
  it('chunks Resend batches at 100 and backs off up to 5 attempts', () => {
    expect(EMAIL_BATCH_SIZE).toBe(100);
    expect(EMAIL_MAX_ATTEMPTS).toBe(5);
    const items = Array.from({ length: 250 }, (_v, index) => index);
    expect(chunk(items, EMAIL_BATCH_SIZE).map((part) => part.length)).toEqual([
      100, 100, 50,
    ]);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(20)).toBe(15 * 60_000);
  });

  it('builds a stable idempotency key from message keys', () => {
    expect(batchIdempotencyKey(['b', 'a'])).toBe(
      batchIdempotencyKey(['a', 'b']),
    );
    expect(batchIdempotencyKey(['a'])).not.toBe(batchIdempotencyKey(['b']));
  });
});
