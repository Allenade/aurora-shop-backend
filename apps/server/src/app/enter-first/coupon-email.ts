const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_COUPON_EMAILS = 100;

export function normalizeCouponEmail(raw?: string | null): string | null {
  const email = raw?.trim().toLowerCase() ?? '';
  if (!email) return null;
  if (!EMAIL_RE.test(email)) return null;
  if (email.length > 254) return null;
  return email;
}

export type ParseCouponEmailsResult =
  { ok: true; emails: string[] } | { ok: false; invalid: string };

/**
 * Split a pasted list (commas, semicolons, spaces, new lines) and merge
 * with an explicit array. Empty input is a shared coupon (no email lock).
 */
export function parseCouponEmails(
  raw?: string | null,
  list?: string[] | null,
): ParseCouponEmailsResult {
  const tokens = [...(list ?? []), ...(raw ?? '').split(/[\s,;]+/)];
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const email = normalizeCouponEmail(trimmed);
    if (!email) return { ok: false, invalid: trimmed };
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length > MAX_COUPON_EMAILS) {
      return { ok: false, invalid: trimmed };
    }
  }
  return { ok: true, emails };
}

export function allowedEmailsFromInvite(row: {
  allowedEmails?: string[] | null;
}): string[] {
  return Array.isArray(row.allowedEmails)
    ? row.allowedEmails.filter((email) => Boolean(email?.trim()))
    : [];
}
