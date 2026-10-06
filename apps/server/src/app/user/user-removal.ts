import { isSuperAdminRole, roleSlugs } from '../course/course-removal';

export { isSuperAdminRole, roleSlugs };

export type UserDeleteRefusal = {
  ok: false;
  status: 403 | 404;
  message: string;
};

export type UserDeleteDecision =
  | UserDeleteRefusal
  | {
      ok: true;
    };

/**
 * Sessions, role rows, and cart lines are removed with the user.
 * Orders, payments, quotes, audit rows, and course enrollments stay.
 * Enrollments are not keyed by user id.
 */
export const USER_DELETE_CLEANUP = [
  'refresh_token',
  'user_role',
  'cart_item',
] as const;

export const USER_DELETE_KEEPS = [
  'shop_order',
  'transaction',
  'quote',
  'audit_log',
  'enter_first_enrollment',
] as const;

export function userDeleteDecision(input: {
  actorId?: string;
  actorIsSuperAdmin: boolean;
  targetExists: boolean;
  targetId: string;
  targetIsSuperAdmin: boolean;
  superAdminCount: number;
}): UserDeleteDecision {
  if (!input.actorId || !input.actorIsSuperAdmin) {
    return { ok: false, status: 403, message: 'Super admin only' };
  }
  if (input.actorId === input.targetId) {
    return {
      ok: false,
      status: 403,
      message: 'You cannot delete your own account',
    };
  }
  if (!input.targetExists) {
    return { ok: false, status: 404, message: 'User not found' };
  }
  if (input.targetIsSuperAdmin && input.superAdminCount <= 1) {
    return {
      ok: false,
      status: 403,
      message: 'Cannot delete the last super admin',
    };
  }
  return { ok: true };
}
