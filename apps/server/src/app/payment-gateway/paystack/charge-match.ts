export type ChargeVerdict = 'match' | 'mismatch';

/**
 * Compare the amount and currency Paystack reports with what we intended to charge.
 * Mock mode (non-production, no secret key) has no captured charge and is treated as a match.
 */
export function evaluateCharge(
  expected: { amount: number; currency: string },
  actual: { amount?: number; currency?: string; mock?: boolean },
): ChargeVerdict {
  if (actual.mock) return 'match';
  if (actual.amount == null || !actual.currency) return 'mismatch';
  if (actual.amount !== expected.amount) return 'mismatch';
  if (actual.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return 'mismatch';
  }
  return 'match';
}

/** Paystack amounts are in kobo. */
export function koboToMajor(kobo: number): number {
  return Math.round(kobo / 100);
}
