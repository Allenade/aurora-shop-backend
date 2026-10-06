/** Role slug seeded for the compliance super admin. */
export const SUPER_ADMIN_ROLE = 'super_admin';

export function roleSlugs(
  assignments:
    Array<{ role?: { slug?: string | null } | null }> | null | undefined,
): string[] {
  return (assignments ?? [])
    .map((assignment) => assignment.role?.slug)
    .filter((slug): slug is string => Boolean(slug));
}

export function isSuperAdminRole(slugs: readonly string[]) {
  return slugs.includes(SUPER_ADMIN_ROLE);
}

/**
 * Rows that store course.id. Soft-remove these before the course so a
 * RESTRICT foreign key cannot block removal. Payment enrollments are not
 * in this list: they store the course slug in JSON and stay for audit.
 */
export const COURSE_DELETE_DETACH = ['course_price_history'] as const;

/**
 * A course can be soft-deleted in any status, including when people have
 * paid or registered. Enrollment and payment rows are left untouched.
 * Price history is soft-removed with the course.
 */
export function courseDeleteKeepsEnrollments(enrollmentCount: number) {
  return {
    softDelete: true as const,
    enrollmentCount,
    keepPayments: true as const,
    detach: COURSE_DELETE_DETACH,
  };
}
