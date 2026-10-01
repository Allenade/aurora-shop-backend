export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const compact = phone.replace(/\s/g, '');
  if (compact.length <= 4) return '****';
  return `${'*'.repeat(compact.length - 4)}${compact.slice(-4)}`;
}

export function maskName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return `${trimmed.slice(0, 1)}***`;
}
