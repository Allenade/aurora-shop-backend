const TEMP_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'sharklasers.com',
  'grr.la',
  'tempmail.com',
  'temp-mail.org',
  'tempmailo.com',
  '10minutemail.com',
  '10minutemail.net',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'trash-mail.com',
  'discard.email',
  'getnada.com',
  'maildrop.cc',
  'fakeinbox.com',
  'throwaway.email',
  'mailnesia.com',
  'dispostable.com',
  'mailcatch.com',
  'tempr.email',
  'moakt.com',
  'guerrillamailblock.com',
  'redacted.invalid',
]);

const BLOCKED_TLDS = new Set(['invalid', 'test', 'example', 'localhost']);

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export type AddressDecision =
  | { action: 'send'; to: string; redirectedFrom?: string }
  | { action: 'skip'; reason: string };

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const email = normaliseEmail(part);
    if (!email || !isDeliverableEmail(email)) continue;
    seen.add(email);
  }
  return [...seen];
}

/** Rejects blank, malformed, and obvious temporary inboxes. */
export function isDeliverableEmail(value: string): boolean {
  const email = normaliseEmail(value);
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  if (!EMAIL_RE.test(email)) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) return false;
  const labels = domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (BLOCKED_TLDS.has(tld)) return false;
  if (TEMP_DOMAINS.has(domain)) return false;
  for (const blocked of TEMP_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return false;
  }
  return true;
}

/**
 * Staging gate. EMAIL_REDIRECT_TO rewrites every recipient.
 * EMAIL_ALLOWLIST drops everyone else. Both empty means send as addressed.
 */
export function deliverAddress(
  email: string,
  options: { allowlist?: string | string[]; redirectTo?: string | null },
): AddressDecision {
  const normalised = normaliseEmail(email);
  if (!isDeliverableEmail(normalised)) {
    return { action: 'skip', reason: 'invalid_or_temp_email' };
  }
  const redirect = normaliseEmail(options.redirectTo ?? '');
  if (redirect) {
    if (!isDeliverableEmail(redirect)) {
      return { action: 'skip', reason: 'invalid_redirect' };
    }
    return {
      action: 'send',
      to: redirect,
      redirectedFrom: normalised === redirect ? undefined : normalised,
    };
  }
  const allowlist = Array.isArray(options.allowlist)
    ? options.allowlist.map(normaliseEmail)
    : parseAllowlist(options.allowlist);
  if (allowlist.length && !allowlist.includes(normalised)) {
    return { action: 'skip', reason: 'not_allowlisted' };
  }
  return { action: 'send', to: normalised };
}
