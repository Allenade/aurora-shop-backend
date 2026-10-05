import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores the Core 3.0 program on enter-first enrollments and courses.
 * Existing enter-first rows with a blank program are set to Core 3.0.
 * Does not insert courses, email templates, shop users, products, orders, or quotes.
 */
export class Core30Program1735690100000 implements MigrationInterface {
  name = 'Core30Program1735690100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'enter_first_enrollment'
        ) THEN
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "program" character varying(80);
          UPDATE "enter_first_enrollment"
          SET "program" = 'Core 3.0'
          WHERE "source" = 'enter_first'
            AND ("program" IS NULL OR btrim("program") = '');
          UPDATE "enter_first_enrollment"
          SET "program" = 'Core 3.0'
          WHERE "program" IS NULL OR btrim("program") = '';
          ALTER TABLE "enter_first_enrollment"
            ALTER COLUMN "program" SET DEFAULT 'Core 3.0';
          ALTER TABLE "enter_first_enrollment"
            ALTER COLUMN "program" SET NOT NULL;
          CREATE INDEX IF NOT EXISTS "IDX_enter_first_enrollment_program"
            ON "enter_first_enrollment" ("program");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'course'
        ) THEN
          ALTER TABLE "course"
            ADD COLUMN IF NOT EXISTS "program" character varying(80);
          UPDATE "course"
          SET "program" = 'Core 3.0'
          WHERE "program" IS NULL OR btrim("program") = '';
          ALTER TABLE "course"
            ALTER COLUMN "program" SET DEFAULT 'Core 3.0';
          ALTER TABLE "course"
            ALTER COLUMN "program" SET NOT NULL;
          CREATE INDEX IF NOT EXISTS "IDX_course_program"
            ON "course" ("program");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_enter_first_enrollment_program"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_course_program"`);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "program"
    `);
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "program"
    `);
  }
}
