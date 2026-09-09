import { Injectable } from '@nestjs/common';
import { Action, Resource } from '@app/shared';
import { UserEntity } from '../../user/entities/user.entity';
import type {
  SessionPermission,
  SessionRole,
  SessionRule,
  SessionUser,
} from '../dto/auth.types';

@Injectable()
export class AbilityFactoryService {
  toSessionUser(user: UserEntity): SessionUser {
    const roles: SessionRole[] = (user.roleAssignments ?? []).map(
      (assignment) => ({
        id: assignment.role.id,
        name: assignment.role.name,
      }),
    );

    const permissions: SessionPermission[] = [];
    for (const assignment of user.roleAssignments ?? []) {
      for (const permission of assignment.role.permissions ?? []) {
        permissions.push({
          action: permission.action,
          resource: permission.resource,
        });
      }
    }

    const unique = new Map(
      permissions.map((p) => [`${p.action}:${p.resource}`, p]),
    );
    const deduped = [...unique.values()];
    const rules: SessionRule[] = deduped.map((p) => ({
      action: p.action,
      subject: p.resource,
    }));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      type: user.type,
      avatarUrl: user.avatarUrl ?? null,
      roles,
      permissions: deduped,
      rules,
    };
  }

  can(user: SessionUser, action: Action, resource: Resource) {
    const act = action as string;
    const res = resource as string;
    return user.permissions.some(
      (permission) =>
        (permission.action === (Action.MANAGE as string) &&
          (permission.resource === (Resource.ALL as string) ||
            permission.resource === res)) ||
        (permission.action === act && permission.resource === res),
    );
  }
}
