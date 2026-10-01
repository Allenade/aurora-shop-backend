import {
  parseTrustProxy,
  type TrustProxy,
} from '@app/shared/config/env.config';

export function resolveClientIp(input: {
  socketAddress?: string | null;
  forwardedFor?: string | string[] | null;
  trustProxy: TrustProxy;
}): string {
  const remote = normalizeIp(input.socketAddress) || 'unknown';
  if (input.trustProxy === false) return remote;

  const header = Array.isArray(input.forwardedFor)
    ? input.forwardedFor.join(',')
    : input.forwardedFor;
  if (!header?.trim()) return remote;

  const forwarded = header
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
  if (!forwarded.length) return remote;

  // Closest proxy is the socket peer; X-Forwarded-For grows left-to-right.
  const chain = [...forwarded, remote];
  const index = Math.max(0, chain.length - 1 - input.trustProxy);
  return chain[index] ?? remote;
}

export function clientIpFromRequest(req: {
  socket?: { remoteAddress?: string | null };
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  return resolveClientIp({
    socketAddress: req.socket?.remoteAddress,
    forwardedFor: forwarded ?? null,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  });
}

function normalizeIp(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^::ffff:/, '');
}
