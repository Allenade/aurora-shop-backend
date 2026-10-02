import type { QueryRunner } from 'typeorm';
import { AuditLogRequestColumns1735690000000 } from './1735690000000-AuditLogRequestColumns';

describe('AuditLogRequestColumns migration', () => {
  it('adds the audit_log request columns idempotently', async () => {
    const statements: string[] = [];
    const runner = {
      query: (sql: string) => {
        statements.push(sql);
        return Promise.resolve();
      },
    } as unknown as QueryRunner;

    await new AuditLogRequestColumns1735690000000().up(runner);

    const sql = statements.join('\n');
    expect(sql).toContain(
      'ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "ip" varchar(64)',
    );
    expect(sql).toContain(
      'ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "user_agent" varchar(512)',
    );
    expect(sql).toContain(
      'ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "request_id" varchar(80)',
    );
    expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });
});
