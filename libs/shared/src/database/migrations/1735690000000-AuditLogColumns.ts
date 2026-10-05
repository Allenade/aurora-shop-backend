import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align audit_log with AuditLogEntity without rewriting or deleting rows.
 *
 * Core30Compliance adds ip, user_agent, and request_id only when audit_log
 * already exists during that migration. Databases that recorded Core30
 * before those statements were present, or that created audit_log without
 * them, fail GET /admin/audit-logs with `column a.ip does not exist`.
 * ADD COLUMN IF NOT EXISTS is safe to run more than once.
 */
export class AuditLogColumns1735690000000 implements MigrationInterface {
  name = 'AuditLogColumns1735690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "type" character varying NOT NULL,
        "action" character varying NOT NULL,
        "user_id" uuid,
        "resource_type" character varying,
        "resource_id" character varying,
        "decision" character varying,
        "reason" character varying,
        "metadata" jsonb,
        "ip" character varying(64),
        "user_agent" character varying(512),
        "request_id" character varying(80)
      );
    `);

    await queryRunner.query(`
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now();
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "type" character varying NOT NULL DEFAULT 'access';
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "action" character varying NOT NULL DEFAULT '';
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_id" uuid;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "resource_type" character varying;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "resource_id" character varying;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "decision" character varying;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "reason" character varying;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" character varying(64);
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" character varying(512);
      ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" character varying(80);
    `);
  }

  public down(): Promise<void> {
    return Promise.resolve();
  }
}
