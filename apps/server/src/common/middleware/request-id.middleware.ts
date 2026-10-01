import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { resolveClientIp } from '../client-ip';
import { requestContext } from '../request-context';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && incoming.trim() ? incoming.trim() : randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  const hops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
  const ip = resolveClientIp({
    socketIp: req.ip || req.socket?.remoteAddress,
    forwardedFor: req.headers['x-forwarded-for'],
    trustProxyHops: Number.isFinite(hops) ? hops : 1,
  });

  requestContext.run(
    {
      requestId,
      ip,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 512),
    },
    () => next(),
  );
}
