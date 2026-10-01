import { createHash } from 'crypto';

export const EMAIL_BATCH_SIZE = 100;
export const EMAIL_MAX_ATTEMPTS = 5;

export function backoffMs(attempt: number): number {
  const exponent = Math.max(0, attempt);
  return Math.min(15 * 60_000, 1000 * 2 ** exponent);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** Stable batch key derived from the per-message idempotency keys. */
export function batchIdempotencyKey(keys: string[]): string {
  const hash = createHash('sha256')
    .update([...keys].sort().join('|'))
    .digest('hex');
  return `batch_${hash}`;
}
