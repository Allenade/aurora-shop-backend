import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Coupon email lock is an optional list. Empty means a shared code, including free.
 */
export class CouponAllowedEmails1735691000000 implements MigrationInterface {
  name = 'CouponAllowedEmails1735691000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite"
      ADD COLUMN IF NOT EXISTS "allowed_emails" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
    await queryRunner.query(`
      UPDATE "enter_first_invite"
      SET "allowed_emails" = jsonb_build_array(lower(trim("allowed_email")))
      WHERE "allowed_email" IS NOT NULL
        AND trim("allowed_email") <> ''
        AND ("allowed_emails" IS NULL OR "allowed_emails" = '[]'::jsonb);
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_enter_first_invite_allowed_email";
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite" DROP COLUMN IF EXISTS "allowed_email";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite"
      ADD COLUMN IF NOT EXISTS "allowed_email" varchar(254);
    `);
    await queryRunner.query(`
      UPDATE "enter_first_invite"
      SET "allowed_email" = lower(trim("allowed_emails"->>0))
      WHERE jsonb_typeof("allowed_emails") = 'array'
        AND jsonb_array_length("allowed_emails") > 0;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enter_first_invite_allowed_email"
      ON "enter_first_invite" ("allowed_email");
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite" DROP COLUMN IF EXISTS "allowed_emails";
    `);
  }
}
