import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Named public links on a course, kept in the order the admin saved them.
 * Adds a column only. Does not insert courses or links.
 */
export class CourseLinks1735690700000 implements MigrationInterface {
  name = 'CourseLinks1735690700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course"
      ADD COLUMN IF NOT EXISTS "links" jsonb NOT NULL DEFAULT '[]';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "links";
    `);
  }
}
