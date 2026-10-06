import { isSuperAdminRole, roleSlugs } from '../course/course-removal';

export { isSuperAdminRole, roleSlugs };

export type EnrollmentDeleteRefusal = {
  ok: false;
  status: 403 | 404;
  message: string;
};

export type EnrollmentDeleteDecision =
  | EnrollmentDeleteRefusal
  | {
      ok: true;
    };

/**
 * Refund requests reference the enrollment. They are soft-deleted first so a
 * foreign key cannot reject the delete. No payment provider is called.
 * Email messages and data requests only store the id and are left in place.
 */
export const ENROLLMENT_DELETE_RELATED = ['refund_request'] as const;

export function enrollmentDeleteDecision(input: {
  actorId?: string;
  actorIsSuperAdmin: boolean;
  targetExists: boolean;
}): EnrollmentDeleteDecision {
  if (!input.actorId || !input.actorIsSuperAdmin) {
    return { ok: false, status: 403, message: 'Super admin only' };
  }
  if (!input.targetExists) {
    return { ok: false, status: 404, message: 'Enrollment not found' };
  }
  return { ok: true };
}

/** Clear-all has no missing-record case. An empty list still succeeds. */
export function enrollmentClearDecision(input: {
  actorId?: string;
  actorIsSuperAdmin: boolean;
}): EnrollmentDeleteRefusal | { ok: true } {
  if (!input.actorId || !input.actorIsSuperAdmin) {
    return { ok: false, status: 403, message: 'Super admin only' };
  }
  return { ok: true };
}
