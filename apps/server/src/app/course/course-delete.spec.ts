import { readFileSync } from 'fs';
import { join } from 'path';
import {
  courseDeleteKeepsEnrollments,
  isSuperAdminRole,
  roleSlugs,
} from './course-removal';

describe('course removal rules', () => {
  it('soft-deletes a course in any status and keeps the enrollment count', () => {
    expect(courseDeleteKeepsEnrollments(0)).toEqual({
      softDelete: true,
      enrollmentCount: 0,
    });
    expect(courseDeleteKeepsEnrollments(4)).toEqual({
      softDelete: true,
      enrollmentCount: 4,
    });
  });

  it('treats only the super_admin role as allowed to clear the catalogue', () => {
    expect(isSuperAdminRole(['super_admin'])).toBe(true);
    expect(isSuperAdminRole(['compliance_manager', 'super_admin'])).toBe(true);
    expect(isSuperAdminRole(['compliance_manager'])).toBe(false);
    expect(isSuperAdminRole(['compliance_viewer'])).toBe(false);
    expect(isSuperAdminRole([])).toBe(false);
    expect(
      roleSlugs([
        { role: { slug: 'compliance_manager' } },
        { role: { slug: 'super_admin' } },
        { role: null },
      ]),
    ).toEqual(['compliance_manager', 'super_admin']);
    expect(roleSlugs(null)).toEqual([]);
  });

  it('soft-deletes one course without the old draft-only guard', () => {
    const source = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const remove = source.slice(
      source.indexOf('async remove('),
      source.indexOf('async clearAll('),
    );
    expect(remove).toContain('courseDeleteKeepsEnrollments');
    expect(remove).toContain('this.courses.softRemove(row)');
    expect(remove).not.toContain("status !== 'draft'");
    expect(remove).not.toContain('Only draft courses');
    expect(remove).not.toContain('this.enrollments.delete');
    expect(remove).not.toContain('this.enrollments.softRemove');
  });

  it('clears every course for a super admin and does not seed replacements', () => {
    const source = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const clear = source.slice(
      source.indexOf('async clearAll('),
      source.indexOf('async archive('),
    );
    expect(clear).toContain('this.assertSuperAdmin(userId)');
    expect(clear).toContain('this.courses.find()');
    expect(clear).toContain('this.courses.softRemove(rows)');
    expect(clear).not.toContain('this.courses.save');
    expect(clear).not.toContain('this.courses.create');
    expect(clear).not.toMatch(/seed/i);
    expect(source).toContain('isSuperAdminRole(roleSlugs');
  });
});
