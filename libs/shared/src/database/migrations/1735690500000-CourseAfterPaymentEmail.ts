import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * After-payment course message, per-enrollment confirmation email status,
 * and scheduled compose fields. Adds columns only. Does not insert rows.
 */
export class CourseAfterPaymentEmail1735690500000 implements MigrationInterface {
  name = 'CourseAfterPaymentEmail1735690500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "course"
      ADD COLUMN IF NOT EXISTS "after_payment_email" text;
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      ADD COLUMN IF NOT EXISTS "confirmation_email_status" varchar(16);
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      ADD COLUMN IF NOT EXISTS "confirmation_email_claimed_at" timestamptz;
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      ADD COLUMN IF NOT EXISTS "confirmation_email_error" text;
    `);
    await queryRunner.query(`
      ALTER TABLE "email_campaign"
      ADD COLUMN IF NOT EXISTS "selectors" jsonb NOT NULL DEFAULT '[]';
    `);
    await queryRunner.query(`
      ALTER TABLE "email_campaign"
      ADD COLUMN IF NOT EXISTS "scheduled_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_campaign" DROP COLUMN IF EXISTS "scheduled_at";
    `);
    await queryRunner.query(`
      ALTER TABLE "email_campaign" DROP COLUMN IF EXISTS "selectors";
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      DROP COLUMN IF EXISTS "confirmation_email_error";
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      DROP COLUMN IF EXISTS "confirmation_email_claimed_at";
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment"
      DROP COLUMN IF EXISTS "confirmation_email_status";
    `);
    await queryRunner.query(`
      ALTER TABLE "course" DROP COLUMN IF EXISTS "after_payment_email";
    `);
  }
}
