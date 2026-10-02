import type {
  SessionPermission,
  SessionRole,
  SessionRule,
  SessionUser,
} from '../dto/auth.types';

export type SessionSource = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  type: SessionUser['type'];
  avatarUrl?: string | null;
  roleAssignments?: Array<{
    role: {
      id: string;
      name: string;
      slug: string;
      permissions?: Array<{ action: string; resource: string }>;
    };
  }>;
};

export function buildSessionUser(user: SessionSource): SessionUser {
  const roles: SessionRole[] = (user.roleAssignments ?? []).map(
    (assignment) => ({
      id: assignment.role.id,
      name: assignment.role.name,
      slug: assignment.role.slug,
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
    permissions.map((permission) => [
      `${permission.action}:${permission.resource}`,
      permission,
    ]),
  );
  const deduped = [...unique.values()];
  const rules: SessionRule[] = deduped.map((permission) => ({
    action: permission.action,
    subject: permission.resource,
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
