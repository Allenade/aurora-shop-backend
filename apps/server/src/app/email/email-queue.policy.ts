import { createHash } from 'crypto';

export const EMAIL_BATCH_LIMIT = 100;

export type EmailKind = 'transactional' | 'marketing';

export function retryDelayMs(
  attemptsAfterFailure: number,
  maxAttempts = 5,
): number | null {
  if (attemptsAfterFailure >= maxAttempts) return null;
  if (attemptsAfterFailure < 1) return 30_000;
  return 30_000 * 2 ** (attemptsAfterFailure - 1);
}

export function chunkIds<T>(items: T[], size: number): T[][] {
  const n = Math.min(EMAIL_BATCH_LIMIT, Math.max(1, size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function suppressionBlocks(
  reason: string | null | undefined,
  kind: EmailKind,
): boolean {
  if (!reason) return false;
  if (reason === 'hard_bounce' || reason === 'complaint') return true;
  return reason === 'unsubscribe' && kind === 'marketing';
}

export function includeRecipient(input: {
  kind: EmailKind;
  marketingOptIn: boolean;
  suppression?: string | null;
}): { include: boolean; reason?: string } {
  if (suppressionBlocks(input.suppression, input.kind)) {
    return { include: false, reason: input.suppression ?? 'suppressed' };
  }
  if (input.kind === 'marketing' && !input.marketingOptIn) {
    return { include: false, reason: 'marketing_opt_out' };
  }
  return { include: true };
}

export function idempotencyKeyForMessage(messageId: string): string {
  return `ef-email-${messageId}`;
}

export function batchIdempotencyKey(keys: string[]): string {
  return createHash('sha256')
    .update([...keys].sort().join('|'))
    .digest('hex');
}
