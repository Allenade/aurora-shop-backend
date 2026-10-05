import 'reflect-metadata';
import assert from 'node:assert/strict';
import { AuditLogType } from '@app/shared';
import { AuditLogColumns1735690000000 } from '@app/shared/database/migrations/1735690000000-AuditLogColumns';
import { DataSource } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

const databaseUrl =
  process.env.SCHEMA_BOOT_DATABASE_URL ??
  'postgres://aurora:aurora@localhost:5432/aurora_schema_boot';

const keptUserId = '11111111-1111-4111-8111-111111111111';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!Array.isArray(parsed)) throw new Error('expected rows');
  const out: Array<Record<string, unknown>> = [];
  for (const item of parsed) {
    if (!isRecord(item)) throw new Error('expected row');
    out.push({ ...item });
  }
  return out;
}

async function main() {
  const admin = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
  });
  await admin.initialize();
  await admin.query('DROP SCHEMA IF EXISTS audit_boot CASCADE');
  await admin.query('CREATE SCHEMA audit_boot');
  await admin.query(`
    CREATE TABLE audit_boot.audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      deleted_at TIMESTAMP,
      type character varying NOT NULL,
      action character varying NOT NULL,
      user_id uuid,
      resource_type character varying,
      resource_id character varying,
      decision character varying,
      reason character varying,
      metadata jsonb
    );
  `);
  await admin.query(
    `INSERT INTO audit_boot.audit_log (type, action, user_id, metadata)
     VALUES ('access', 'LOGIN', $1, '{"kept":true}'::jsonb)`,
    [keptUserId],
  );
  await admin.destroy();

  const migrated = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    entities: [AuditLogEntity],
    extra: { options: '-c search_path=audit_boot' },
  });
  await migrated.initialize();
  const migration = new AuditLogColumns1735690000000();
  const runner = migrated.createQueryRunner();
  await migration.up(runner);
  await migration.up(runner);

  const columns = rowsOf(
    await runner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'audit_boot' AND table_name = 'audit_log'`,
    ),
  ).map((row) => row.column_name);
  for (const name of ['ip', 'user_agent', 'request_id']) {
    assert.ok(columns.includes(name), `missing ${name}`);
  }

  const repo = migrated.getRepository(AuditLogEntity);
  await repo.save(
    repo.create({
      type: AuditLogType.ACCESS,
      action: 'ADMIN_VIEW',
      userId: keptUserId,
      ip: '203.0.113.10',
      userAgent: 'compliance-dashboard',
      requestId: 'req-audit-1',
      metadata: { path: '/admin/audit-logs' },
    }),
  );
  const listed = await repo
    .createQueryBuilder('a')
    .orderBy('a.createdAt', 'ASC')
    .getMany();
  assert.equal(listed.length, 2);
  const kept = listed.find((row) => row.action === 'LOGIN');
  const fresh = listed.find((row) => row.action === 'ADMIN_VIEW');
  assert.ok(kept);
  assert.equal(kept.userId, keptUserId);
  assert.equal(kept.ip ?? null, null);
  assert.deepEqual(kept.metadata, { kept: true });
  assert.ok(fresh);
  assert.equal(fresh.ip, '203.0.113.10');
  assert.equal(fresh.userAgent, 'compliance-dashboard');
  assert.equal(fresh.requestId, 'req-audit-1');

  const selected = rowsOf(
    await runner.query(
      `SELECT a.action, a.ip, a.user_agent, a.request_id
       FROM audit_log a
       WHERE a.action = 'ADMIN_VIEW'`,
    ),
  );
  assert.equal(selected[0]?.ip, '203.0.113.10');
  assert.equal(selected[0]?.user_agent, 'compliance-dashboard');
  assert.equal(selected[0]?.request_id, 'req-audit-1');

  await runner.release();
  await migrated.query('DROP SCHEMA IF EXISTS audit_boot CASCADE');
  await migrated.destroy();
  console.log('audit log schema boot ok');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
