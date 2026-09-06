import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessAuditAction, AuditLogType } from '@app/shared';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { UserRepository } from '../../user/repositories/user.repository';
import { AbilityFactoryService } from '../ability/ability-factory.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/require-permissions.decorator';
import type { JwtPayload } from '../dto/auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UserRepository,
    private readonly abilities: AbilityFactoryService,
    private readonly audit: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requirements =
      this.reflector.getAllAndOverride<PermissionRequirement[]>(
        PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    if (requirements.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = await this.users.findByIdWithRoles(request.user.sub);
    if (!user) throw new ForbiddenException('Account not found');

    const session = this.abilities.toSessionUser(user);
    const allowed = requirements.every((requirement) =>
      this.abilities.can(session, requirement.action, requirement.resource),
    );
    if (!allowed) {
      this.audit.log({
        type: AuditLogType.ACCESS,
        action: AccessAuditAction.ACCESS_DENIED,
        userId: user.id,
        resourceType: requirements.map((r) => r.resource).join(','),
        decision: 'deny',
      });
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
