export function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.trim();
  if (digits.length <= 4) return '***';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
