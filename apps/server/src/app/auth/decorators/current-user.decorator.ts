import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../dto/auth.types';

export const CurrentUser = createParamDecorator(
  (property: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;
    return property ? user?.[property] : user;
  },
);
