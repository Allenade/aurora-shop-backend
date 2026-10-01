import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { parseRateLimitEnabled } from '@app/shared';
import { clientIpFromRequest } from './client-ip';

/**
 * Rate limit for public Enter First routes.
 * The tracker is the client address, using X-Forwarded-For only when
 * TRUST_PROXY says the connecting peer is a trusted proxy.
 */
@Injectable()
export class PublicEndpointThrottlerGuard extends ThrottlerGuard {
  async canActivate(
    context: Parameters<ThrottlerGuard['canActivate']>[0],
  ): Promise<boolean> {
    if (!parseRateLimitEnabled(process.env.RATE_LIMIT_ENABLED)) return true;
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return await Promise.resolve(clientIpFromRequest(req));
  }
}
