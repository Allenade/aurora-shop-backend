import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional course picture and syllabus (PDF url and/or rich text).
 * Adds nullable columns only. Does not insert courses, prices, or files.
 */
export class CourseImageSyllabus1735690400000 implements MigrationInterface {
  name = 'CourseImageSyllabus1735690400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "image_url" varchar(2048);
    `);
    await queryRunner.query(`
      ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "syllabus_url" varchar(2048);
    `);
    await queryRunner.query(`
      ALTER TABLE "course"
      ADD COLUMN IF NOT EXISTS "syllabus_filename" varchar(255);
    `);
    await queryRunner.query(`
      ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "syllabus_text" text;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "syllabus_text";
    `);
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "syllabus_filename";
    `);
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "syllabus_url";
    `);
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "image_url";
    `);
  }
}
