import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { resolveClientIp } from '../client-ip';

/** Rate-limit key is the client IP, honouring X-Forwarded-For only for trusted hops. */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const hops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
    const request = req as {
      ip?: string;
      socket?: { remoteAddress?: string };
      headers?: { 'x-forwarded-for'?: string | string[] };
    };
    return Promise.resolve(
      resolveClientIp({
        socketIp: request.ip || request.socket?.remoteAddress || '',
        forwardedFor: request.headers?.['x-forwarded-for'],
        trustProxyHops: Number.isFinite(hops) ? hops : 1,
      }),
    );
  }
}
