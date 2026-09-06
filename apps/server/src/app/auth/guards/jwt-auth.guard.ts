import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      const reason =
        info && typeof info === 'object' && 'message' in info
          ? info.message
          : undefined;
      throw (
        err ??
        new UnauthorizedException(
          reason === 'jwt expired'
            ? 'Session has expired. Please sign in again.'
            : 'Authentication required.',
        )
      );
    }
    return user;
  }
}
