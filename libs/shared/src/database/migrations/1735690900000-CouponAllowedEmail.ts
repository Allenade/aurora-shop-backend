import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional email lock on a coupon. Free / 100% coupons require it.
 */
export class CouponAllowedEmail1735690900000 implements MigrationInterface {
  name = 'CouponAllowedEmail1735690900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite"
      ADD COLUMN IF NOT EXISTS "allowed_email" varchar(254);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enter_first_invite_allowed_email"
      ON "enter_first_invite" ("allowed_email");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_enter_first_invite_allowed_email";
    `);
    await queryRunner.query(`
      ALTER TABLE "enter_first_invite" DROP COLUMN IF EXISTS "allowed_email";
    `);
  }
}
