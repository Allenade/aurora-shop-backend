import { readFileSync } from 'fs';
import { join } from 'path';
import {
  courseDeleteKeepsEnrollments,
  isSuperAdminRole,
  roleSlugs,
} from './course-removal';

describe('course removal rules', () => {
  it('soft-deletes a course in any status and keeps paid enrollments', () => {
    expect(courseDeleteKeepsEnrollments(0)).toEqual({
      softDelete: true,
      enrollmentCount: 0,
      keepPayments: true,
      detach: ['course_price_history'],
    });
    expect(courseDeleteKeepsEnrollments(4)).toEqual({
      softDelete: true,
      enrollmentCount: 4,
      keepPayments: true,
      detach: ['course_price_history'],
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
    expect(remove).toContain('this.softRemoveCourses([row])');
    expect(remove).not.toContain("status !== 'draft'");
    expect(remove).not.toContain('Only draft courses');
    expect(remove).not.toContain('this.enrollments.delete');
    expect(remove).not.toContain('this.enrollments.softRemove');
  });

  it('soft-removes price history before the course and keeps payments', () => {
    const source = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const detach = source.slice(
      source.indexOf('private async softRemoveCourses('),
      source.indexOf('private async coursesInProgram('),
    );
    const historyAt = detach.indexOf('manager.softRemove(history)');
    const courseAt = detach.indexOf('manager.softRemove(rows)');
    expect(historyAt).toBeGreaterThan(-1);
    expect(courseAt).toBeGreaterThan(historyAt);
    expect(detach).toContain('CoursePriceHistoryEntity');
    expect(detach).not.toContain('this.enrollments');
    expect(source).not.toContain('this.enrollments.delete');
    expect(source).not.toContain('this.enrollments.softRemove');
  });

  it('clears every course for a super admin and does not seed replacements', () => {
    const source = readFileSync(join(__dirname, 'course.service.ts'), 'utf8');
    const clear = source.slice(
      source.indexOf('async clearAll('),
      source.indexOf('async archive('),
    );
    expect(clear).toContain('this.assertSuperAdmin(userId)');
    expect(clear).toContain('this.courses.find()');
    expect(clear).toContain('this.softRemoveCourses(rows)');
    expect(clear).not.toContain('this.courses.save');
    expect(clear).not.toContain('this.courses.create');
    expect(clear).not.toMatch(/seed/i);
    expect(source).toContain('isSuperAdminRole(roleSlugs');
  });

  it('cascades course_price_history when a course row is removed', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../../../../libs/shared/src/database/migrations/1735690300000-CoursePriceHistoryCascade.ts',
      ),
      'utf8',
    );
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).toContain('FK_course_price_history_course');
    expect(migration).not.toMatch(/INSERT INTO/i);
  });
});
