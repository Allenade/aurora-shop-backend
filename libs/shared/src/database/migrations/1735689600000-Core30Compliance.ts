import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Core 3.0 compliance schema.
 * Idempotent so it can run on databases previously created by TypeORM synchronize.
 */
export class Core30Compliance1735689600000 implements MigrationInterface {
  name = 'Core30Compliance1735689600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "course" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "slug" varchar(40) NOT NULL,
        "name" varchar(160) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "price" integer,
        "currency" varchar(8) NOT NULL DEFAULT 'NGN',
        "is_free" boolean NOT NULL DEFAULT false,
        "seat_cap" integer,
        "start_date" timestamptz,
        "end_date" timestamptz,
        "enrollment_cutoff" timestamptz,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "sort_order" integer NOT NULL DEFAULT 0,
        "cohort" varchar(80)
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_course_slug" ON "course" ("slug");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "course_price_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "course_id" uuid NOT NULL,
        "changed_by" uuid,
        "old_price" integer,
        "new_price" integer,
        "old_currency" varchar(8),
        "new_currency" varchar(8) NOT NULL,
        "effective_from" timestamptz NOT NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_course_price_history_course"
      ON "course_price_history" ("course_id");
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'enter_first_enrollment'
        ) THEN
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "price_snapshot" jsonb NOT NULL DEFAULT '[]';
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paystack_transaction_id" varchar(64);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paid_amount" integer;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paid_currency" varchar(8);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "paystack_channel" varchar(32);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "verified_at" timestamptz;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "confirmation_source" varchar(16);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "amount_mismatch" boolean NOT NULL DEFAULT false;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "currency_mismatch" boolean NOT NULL DEFAULT false;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "terms_version" varchar(32);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "privacy_version" varchar(32);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_at" timestamptz;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "marketing_opt_in" boolean NOT NULL DEFAULT false;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_ip" varchar(64);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "consent_user_agent" varchar(512);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "age_confirmed" boolean;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "date_of_birth" date;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "is_minor" boolean;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_name" varchar(120);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_email" varchar(254);
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_consent" boolean;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "guardian_consent_at" timestamptz;
          ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "anonymised_at" timestamptz;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log'
        ) THEN
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" varchar(64);
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" varchar(80);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "slug" varchar(80) NOT NULL,
        "name" varchar(160) NOT NULL,
        "subject" varchar(200) NOT NULL,
        "html" text NOT NULL,
        "text" text NOT NULL DEFAULT '',
        "kind" varchar(20) NOT NULL DEFAULT 'transactional',
        "created_by" uuid
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_template_slug" ON "email_template" ("slug");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_campaign" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "name" varchar(160) NOT NULL,
        "template_id" uuid,
        "subject" varchar(200) NOT NULL,
        "html" text NOT NULL,
        "text" text NOT NULL DEFAULT '',
        "kind" varchar(20) NOT NULL,
        "audience" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(20) NOT NULL DEFAULT 'queued',
        "total_recipients" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "created_by" uuid,
        "attachments" jsonb NOT NULL DEFAULT '[]'
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_message" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "campaign_id" uuid,
        "enrollment_id" uuid,
        "to_email" varchar(254) NOT NULL,
        "to_name" varchar(160) NOT NULL DEFAULT '',
        "subject" varchar(200) NOT NULL,
        "html" text NOT NULL,
        "text" text NOT NULL DEFAULT '',
        "kind" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'queued',
        "attempts" integer NOT NULL DEFAULT 0,
        "resend_id" varchar(80),
        "idempotency_key" varchar(80) NOT NULL,
        "last_error" text,
        "next_attempt_at" timestamptz,
        "claim_token" varchar(64),
        "attachments" jsonb NOT NULL DEFAULT '[]'
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_message_idempotency"
      ON "email_message" ("idempotency_key");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_message_campaign" ON "email_message" ("campaign_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_email_message_resend" ON "email_message" ("resend_id");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_suppression" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "email" varchar(254) NOT NULL,
        "reason" varchar(32) NOT NULL
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_suppression_email"
      ON "email_suppression" ("email");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refund_request" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "enrollment_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "currency" varchar(8) NOT NULL DEFAULT 'NGN',
        "reason" varchar(500) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'requested',
        "requested_by" uuid,
        "reviewed_by" uuid,
        "review_note" varchar(500),
        "paystack_refund_id" varchar(64),
        "processed_at" timestamptz,
        "failure_reason" varchar(500)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "data_request" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "type" varchar(16) NOT NULL,
        "subject_email" varchar(254) NOT NULL,
        "enrollment_id" uuid,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "due_date" timestamptz NOT NULL,
        "requested_by" uuid,
        "notes" varchar(1000),
        "completed_at" timestamptz
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "setting" (
        "key" varchar(80) PRIMARY KEY,
        "value" jsonb NOT NULL DEFAULT '{}',
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_by" uuid
      );
    `);

    await queryRunner.query(`
      INSERT INTO "course" (
        "slug", "name", "description", "price", "currency", "is_free", "status", "sort_order"
      )
      VALUES
        ('iot', 'Internet of Things', 'Connected devices, sensors, and embedded networking.', NULL, 'NGN', false, 'draft', 0),
        ('mobile', 'Mobile Development', 'Mobile application engineering.', NULL, 'NGN', false, 'draft', 1),
        ('ai', 'Artificial Intelligence', 'Applied machine learning and AI systems.', NULL, 'NGN', false, 'draft', 2),
        ('blockchain', 'Blockchain', 'Distributed ledgers and smart contracts.', NULL, 'NGN', false, 'draft', 3),
        ('arm', 'ARM Embedded Systems', 'ARM architecture and embedded firmware.', NULL, 'NGN', false, 'draft', 4),
        ('vision', 'Computer Vision', 'Image understanding and vision systems.', NULL, 'NGN', false, 'draft', 5),
        ('programming', 'Programming', 'Software engineering fundamentals.', NULL, 'NGN', false, 'draft', 6),
        ('aerial', 'Aerial Robotics', 'Drones and aerial robotic systems.', NULL, 'NGN', false, 'draft', 7)
      ON CONFLICT ("slug") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_request"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_request"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_suppression"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_campaign"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_template"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "course_price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "course"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "setting"`);
  }
}
