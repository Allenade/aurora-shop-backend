/**
 * Client IP from X-Forwarded-For, trusting only the configured number of proxies.
 * Matches Express `trust proxy` hop counting: the left-most untrusted address is the client.
 * Hops of 0 ignores the header entirely.
 */
export function resolveClientIp(input: {
  socketIp?: string | null;
  forwardedFor?: string | string[] | null;
  trustProxyHops: number;
}): string {
  const socketIp = (input.socketIp ?? '').trim() || 'unknown';
  const hops = input.trustProxyHops;
  if (!Number.isFinite(hops) || hops <= 0) return socketIp;

  const raw = Array.isArray(input.forwardedFor)
    ? input.forwardedFor.join(',')
    : (input.forwardedFor ?? '');
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return socketIp;

  const index = parts.length - hops - 1;
  if (index >= 0) return parts[index];
  return parts[0];
}
