import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align enter_first_enrollment text columns with the entity without
 * dropping or truncating existing rows.
 *
 * Pre-PR synchronize created these as unbounded character varying.
 * A shorter length makes TypeORM drop the column and add it again as
 * NOT NULL, which fails when rows already exist and would wipe values.
 * This migration widens in place (USING the existing text) and backfills
 * required columns before SET NOT NULL.
 */
export class EnrollmentColumnAlign1735689800000 implements MigrationInterface {
  name = 'EnrollmentColumnAlign1735689800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "enter_first_enrollment" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "source" character varying NOT NULL DEFAULT 'enter_first',
        "first_name" character varying NOT NULL,
        "last_name" character varying NOT NULL,
        "email" character varying NOT NULL,
        "phone" character varying,
        "tracks" jsonb NOT NULL DEFAULT '[]',
        "amount" integer NOT NULL DEFAULT 0,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "price_snapshot" jsonb NOT NULL DEFAULT '[]',
        "payment_status" character varying NOT NULL DEFAULT 'pending',
        "paystack_reference" character varying,
        "authorization_url" character varying,
        "paystack_transaction_id" character varying(64),
        "paid_amount" integer,
        "paid_currency" character varying(8),
        "paystack_channel" character varying(32),
        "verified_at" timestamptz,
        "confirmation_source" character varying(16),
        "amount_mismatch" boolean NOT NULL DEFAULT false,
        "currency_mismatch" boolean NOT NULL DEFAULT false,
        "paid_at" timestamptz,
        "form" jsonb NOT NULL DEFAULT '{}',
        "email_sent_at" timestamptz,
        "terms_version" character varying(32),
        "privacy_version" character varying(32),
        "consent_at" timestamptz,
        "marketing_opt_in" boolean NOT NULL DEFAULT false,
        "consent_ip" character varying(64),
        "consent_user_agent" character varying(512),
        "age_confirmed" boolean,
        "date_of_birth" date,
        "is_minor" boolean,
        "guardian_name" character varying(120),
        "guardian_email" character varying(254),
        "guardian_consent" boolean,
        "guardian_consent_at" timestamptz,
        "anonymised_at" timestamptz
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "price_snapshot" jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paystack_transaction_id" character varying(64);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paid_amount" integer;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paid_currency" character varying(8);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paystack_channel" character varying(32);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "verified_at" timestamptz;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "confirmation_source" character varying(16);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "amount_mismatch" boolean NOT NULL DEFAULT false;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "currency_mismatch" boolean NOT NULL DEFAULT false;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "terms_version" character varying(32);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "privacy_version" character varying(32);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_at" timestamptz;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "marketing_opt_in" boolean NOT NULL DEFAULT false;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_ip" character varying(64);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_user_agent" character varying(512);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "age_confirmed" boolean;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "date_of_birth" date;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "is_minor" boolean;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_name" character varying(120);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_email" character varying(254);
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_consent" boolean;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_consent_at" timestamptz;
      ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "anonymised_at" timestamptz;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        col text;
        required text[] := ARRAY[
          'source', 'first_name', 'last_name', 'email', 'currency', 'payment_status'
        ];
        unbounded text[] := ARRAY[
          'source', 'first_name', 'last_name', 'email', 'phone',
          'currency', 'payment_status', 'paystack_reference', 'authorization_url'
        ];
      BEGIN
        FOREACH col IN ARRAY unbounded LOOP
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'enter_first_enrollment' AND column_name = col
          ) THEN
            EXECUTE format(
              'ALTER TABLE "enter_first_enrollment" ALTER COLUMN %I TYPE character varying USING %I::text',
              col,
              col
            );
          END IF;
        END LOOP;

        FOREACH col IN ARRAY required LOOP
          EXECUTE format(
            'UPDATE "enter_first_enrollment" SET %I = %L WHERE %I IS NULL',
            col,
            CASE col
              WHEN 'source' THEN 'enter_first'
              WHEN 'currency' THEN 'NGN'
              WHEN 'payment_status' THEN 'pending'
              ELSE ''
            END,
            col
          );
          EXECUTE format(
            'ALTER TABLE "enter_first_enrollment" ALTER COLUMN %I SET NOT NULL',
            col
          );
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enter_first_enrollment_email"
      ON "enter_first_enrollment" ("email");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_enter_first_enrollment_paystack_reference"
      ON "enter_first_enrollment" ("paystack_reference")
      WHERE "paystack_reference" IS NOT NULL;
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
    return Promise.resolve();
  }
}
