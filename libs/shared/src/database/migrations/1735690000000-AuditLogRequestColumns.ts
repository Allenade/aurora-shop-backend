import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the request columns that AuditLogEntity reads and writes.
 * Core30Compliance only added them when audit_log already existed, so a
 * database where that step was skipped still lacks them and every
 * GET /admin/audit-logs fails with "column a.ip does not exist".
 * Idempotent: safe on databases that already have the columns.
 */
export class AuditLogRequestColumns1735690000000 implements MigrationInterface {
  name = 'AuditLogRequestColumns1735690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'audit_log'
        ) THEN
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" varchar(64);
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512);
          ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" varchar(80);
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // Core30Compliance owns these columns. Nothing to undo here.
  }
}
