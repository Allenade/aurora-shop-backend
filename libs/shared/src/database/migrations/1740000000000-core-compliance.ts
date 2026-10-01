import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Core 3.0 compliance schema.
 * Statements are idempotent so they are safe next to TypeORM synchronize in development.
 */
export class CoreCompliance1740000000000 implements MigrationInterface {
  name = 'CoreCompliance1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "course" (
        "id" uuid NOT NULL,
        "slug" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "price" integer NOT NULL DEFAULT 0,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "is_free" boolean NOT NULL DEFAULT false,
        "seat_cap" integer,
        "start_date" TIMESTAMP WITH TIME ZONE,
        "end_date" TIMESTAMP WITH TIME ZONE,
        "enrollment_cutoff" TIMESTAMP WITH TIME ZONE,
        "status" character varying NOT NULL DEFAULT 'draft',
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_course" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_course_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "course_price_history" (
        "id" uuid NOT NULL,
        "course_id" uuid NOT NULL,
        "actor_id" uuid,
        "old_price" integer NOT NULL,
        "new_price" integer NOT NULL,
        "old_currency" character varying,
        "new_currency" character varying,
        "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_course_price_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_course_price_history_course" ON "course_price_history" ("course_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "setting" (
        "id" uuid NOT NULL,
        "key" character varying NOT NULL,
        "value" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_setting" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_setting_key" UNIQUE ("key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template" (
        "id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "subject" character varying NOT NULL,
        "kind" character varying NOT NULL DEFAULT 'transactional',
        "blocks" jsonb NOT NULL DEFAULT '[]',
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_email_template" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_segment" (
        "id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "filters" jsonb NOT NULL DEFAULT '{}',
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_email_segment" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_campaign" (
        "id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "subject" character varying NOT NULL,
        "kind" character varying NOT NULL DEFAULT 'transactional',
        "status" character varying NOT NULL DEFAULT 'draft',
        "blocks" jsonb NOT NULL DEFAULT '[]',
        "audience" jsonb NOT NULL DEFAULT '{}',
        "scheduled_at" TIMESTAMP WITH TIME ZONE,
        "created_by" uuid,
        "stats" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_email_campaign" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_message" (
        "id" uuid NOT NULL,
        "campaign_id" uuid,
        "enrollment_id" uuid,
        "to_email" character varying NOT NULL,
        "subject" character varying NOT NULL,
        "html" text NOT NULL DEFAULT '',
        "text_body" text NOT NULL DEFAULT '',
        "kind" character varying NOT NULL DEFAULT 'transactional',
        "status" character varying NOT NULL DEFAULT 'queued',
        "attempts" integer NOT NULL DEFAULT 0,
        "resend_id" character varying,
        "idempotency_key" character varying NOT NULL,
        "last_error" text,
        "attachments" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_email_message" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_message_idempotency" UNIQUE ("idempotency_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_message_campaign" ON "email_message" ("campaign_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_message_status" ON "email_message" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_suppression" (
        "id" uuid NOT NULL,
        "email" character varying NOT NULL,
        "reason" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_email_suppression" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_suppression_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refund_request" (
        "id" uuid NOT NULL,
        "enrollment_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'NGN',
        "status" character varying NOT NULL DEFAULT 'pending',
        "reason" text,
        "decision_note" text,
        "requested_by" uuid,
        "decided_by" uuid,
        "paystack_refund_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_refund_request" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_request_enrollment" ON "refund_request" ("enrollment_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "data_request" (
        "id" uuid NOT NULL,
        "type" character varying NOT NULL,
        "subject_email" character varying NOT NULL,
        "enrollment_id" uuid,
        "status" character varying NOT NULL DEFAULT 'open',
        "due_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "notes" text,
        "requested_by" uuid,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_data_request" PRIMARY KEY ("id")
      )
    `);

    const enrollmentColumns: Array<[string, string]> = [
      ['terms_version', 'character varying'],
      ['privacy_version', 'character varying'],
      ['consent_at', 'TIMESTAMP WITH TIME ZONE'],
      ['marketing_opt_in', 'boolean NOT NULL DEFAULT false'],
      ['consent_ip', 'character varying'],
      ['consent_user_agent', 'character varying'],
      ['age_confirmed', 'boolean NOT NULL DEFAULT false'],
      ['date_of_birth', 'date'],
      ['guardian_name', 'character varying'],
      ['guardian_email', 'character varying'],
      ['guardian_consent', 'boolean NOT NULL DEFAULT false'],
      ['charged_lines', `jsonb NOT NULL DEFAULT '[]'`],
      ['cohorts', `jsonb NOT NULL DEFAULT '[]'`],
      ['paystack_transaction_id', 'character varying'],
      ['paid_amount', 'integer'],
      ['paid_currency', 'character varying'],
      ['payment_channel', 'character varying'],
      ['verified_at', 'TIMESTAMP WITH TIME ZONE'],
      ['confirmed_via', 'character varying'],
      ['reconciliation_exception', 'character varying'],
    ];
    for (const [name, type] of enrollmentColumns) {
      await queryRunner.query(
        `ALTER TABLE "enter_first_enrollment" ADD COLUMN IF NOT EXISTS "${name}" ${type}`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_audit_log_created" ON "audit_log" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_enter_first_payment_status" ON "enter_first_enrollment" ("payment_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_enter_first_payment_status"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_created"`);
    for (const column of ['request_id', 'user_agent', 'ip']) {
      await queryRunner.query(
        `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    for (const column of [
      'reconciliation_exception',
      'confirmed_via',
      'verified_at',
      'payment_channel',
      'paid_currency',
      'paid_amount',
      'paystack_transaction_id',
      'cohorts',
      'charged_lines',
      'guardian_consent',
      'guardian_email',
      'guardian_name',
      'date_of_birth',
      'age_confirmed',
      'consent_user_agent',
      'consent_ip',
      'marketing_opt_in',
      'consent_at',
      'privacy_version',
      'terms_version',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "enter_first_enrollment" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "data_request"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_request"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_suppression"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_campaign"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_segment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_template"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "setting"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "course_price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "course"`);
  }
}
