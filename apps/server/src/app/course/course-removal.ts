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
 * A course can be soft-deleted in any status.
 * Enrollment rows are left untouched, including their stored course slug.
 */
export function courseDeleteKeepsEnrollments(enrollmentCount: number) {
  return {
    softDelete: true as const,
    enrollmentCount,
  };
}
