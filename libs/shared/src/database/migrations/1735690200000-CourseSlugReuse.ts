import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deleted courses keep their rows, so slug uniqueness applies only to
 * live courses. Recreating a cleared slug is then allowed.
 * Does not insert courses, enrollments, or other seed data.
 */
export class CourseSlugReuse1735690200000 implements MigrationInterface {
  name = 'CourseSlugReuse1735690200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_course_slug"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_slug"
      ON "course" ("slug")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_course_slug"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_slug" ON "course" ("slug")
    `);
  }
}
