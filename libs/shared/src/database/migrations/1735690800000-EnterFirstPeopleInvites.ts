import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * People + invite links for Core 3.0 special offers.
 * Idempotent for databases that may already have synced columns.
 */
export class EnterFirstPeopleInvites1735690800000 implements MigrationInterface {
  name = 'EnterFirstPeopleInvites1735690800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enter_first_person" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "first_name" varchar(80) NOT NULL,
        "last_name" varchar(80) NOT NULL,
        "email" varchar(254) NOT NULL,
        "phone" varchar(32),
        "notes" varchar(280)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enter_first_person_email"
      ON "enter_first_person" ("email");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enter_first_invite" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "code" varchar(32) NOT NULL,
        "label" varchar(160),
        "person_id" uuid,
        "lock_to_person" boolean NOT NULL DEFAULT true,
        "offer_type" varchar(32) NOT NULL,
        "discount_percent" integer,
        "discount_amount" integer,
        "track_scope" varchar(16) NOT NULL DEFAULT 'all',
        "track_slugs" jsonb NOT NULL DEFAULT '[]',
        "max_redemptions" integer,
        "redemption_count" integer NOT NULL DEFAULT 0,
        "expires_at" timestamptz,
        "active" boolean NOT NULL DEFAULT true,
        "notes" varchar(280),
        "created_by" uuid
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enter_first_invite_code"
      ON "enter_first_invite" ("code");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enter_first_invite_person"
      ON "enter_first_invite" ("person_id");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'enter_first_enrollment'
        ) THEN
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "list_amount" integer;
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "pricing_type" varchar(16)
            NOT NULL DEFAULT 'full';
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "invite_id" uuid;
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "invite_code" varchar(32);
          ALTER TABLE "enter_first_enrollment"
            ADD COLUMN IF NOT EXISTS "discount_label" varchar(80);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'enter_first_enrollment'
        ) THEN
          ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "discount_label";
          ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "invite_code";
          ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "invite_id";
          ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "pricing_type";
          ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "list_amount";
        END IF;
      END $$;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "enter_first_invite"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "enter_first_person"`);
  }
}
