import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * course_price_history.course_id is the only foreign key to course.
 * A RESTRICT constraint makes DELETE FROM course fail while history rows
 * exist. Recreate it as ON DELETE CASCADE. Soft-delete of a course is an
 * UPDATE and does not use this clause; the cascade covers a hard delete.
 * Does not insert courses, enrollments, or payments.
 */
export class CoursePriceHistoryCascade1735690300000 implements MigrationInterface {
  name = 'CoursePriceHistoryCascade1735690300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'course_price_history'
        ) THEN
          RETURN;
        END IF;

        SELECT c.conname INTO constraint_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND n.nspname = current_schema()
          AND t.relname = 'course_price_history'
          AND a.attname = 'course_id'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE format(
            'ALTER TABLE course_price_history DROP CONSTRAINT %I',
            constraint_name
          );
        END IF;

        DELETE FROM course_price_history h
        WHERE NOT EXISTS (
          SELECT 1 FROM course c WHERE c.id = h.course_id
        );

        ALTER TABLE course_price_history
          ADD CONSTRAINT "FK_course_price_history_course"
          FOREIGN KEY (course_id) REFERENCES course(id)
          ON DELETE CASCADE;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE course_price_history
      DROP CONSTRAINT IF EXISTS "FK_course_price_history_course"
    `);
  }
}
