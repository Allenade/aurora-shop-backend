import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { shouldSynchronizeSchema } from '@app/shared/config/env.config';
import { Core30Compliance1735689600000 } from '@app/shared/database/migrations/1735689600000-Core30Compliance';
import { CoursePriceNullable1735689700000 } from '@app/shared/database/migrations/1735689700000-CoursePriceNullable';
import { EnrollmentColumnAlign1735689800000 } from '@app/shared/database/migrations/1735689800000-EnrollmentColumnAlign';
import { Core30Program1735690100000 } from '@app/shared/database/migrations/1735690100000-Core30Program';
import { EnterFirstEnrollmentEntity } from './entities/enter-first-enrollment.entity';

const databaseUrl =
  process.env.SCHEMA_BOOT_DATABASE_URL ??
  'postgres://aurora:aurora@localhost:5432/aurora_schema_boot';

const longName = `Ada-${'N'.repeat(120)}`;
const longEmail = `${'a'.repeat(40)}@example.com`;

const migrations = [
  Core30Compliance1735689600000,
  CoursePriceNullable1735689700000,
  EnrollmentColumnAlign1735689800000,
  Core30Program1735690100000,
];

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
  const stagingLike =
    'postgres://aurora:secret@ep-cool.neon.tech/aurora_shop?sslmode=require';
  const synchronize = shouldSynchronizeSchema({
    nodeEnv: 'development',
    databaseUrl: stagingLike,
    dbSynchronize: 'true',
  });
  assert.equal(synchronize, false);

  const admin = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
  });
  await admin.initialize();
  await admin.query('DROP SCHEMA public CASCADE');
  await admin.query('CREATE SCHEMA public');
  await admin.query(`
    CREATE TABLE "enter_first_enrollment" (
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
      "payment_status" character varying NOT NULL DEFAULT 'pending',
      "paystack_reference" character varying,
      "authorization_url" character varying,
      "paid_at" timestamptz,
      "form" jsonb NOT NULL DEFAULT '{}',
      "email_sent_at" timestamptz
    );
  `);
  await admin.query(
    `INSERT INTO "enter_first_enrollment"
      ("first_name", "last_name", "email", "phone", "tracks", "amount", "form", "payment_status", "paystack_reference")
     VALUES
      ($1, 'Okafor', $2, '+2348012345678', '["iot","mobile"]'::jsonb, 15000, '{"firstName":"kept"}'::jsonb, 'success', 'EF-KEEP-1'),
      ('Chinedu', 'Adeyemi', 'chinedu@example.com', NULL, '["ai"]'::jsonb, 0, '{}'::jsonb, 'pending', 'EF-KEEP-2')`,
    [longName, longEmail],
  );
  await admin.destroy();

  const migrated = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize,
    migrationsRun: true,
    migrations,
    entities: [EnterFirstEnrollmentEntity],
  });
  await migrated.initialize();
  const afterMigration = rowsOf(
    await migrated.query(
      `SELECT first_name, last_name, email, phone, amount, payment_status, paystack_reference, form, price_snapshot, program
       FROM enter_first_enrollment ORDER BY paystack_reference`,
    ),
  );
  const courseCount = rowsOf(
    await migrated.query(`SELECT COUNT(*)::int AS count FROM course`),
  );
  const templateCount = rowsOf(
    await migrated.query(
      `SELECT COUNT(*)::int AS count FROM email_template WHERE slug = 'enrollment-confirmation'`,
    ),
  );
  const lengths = rowsOf(
    await migrated.query(
      `SELECT column_name, character_maximum_length
       FROM information_schema.columns
       WHERE table_name = 'enter_first_enrollment'
         AND column_name IN ('first_name', 'last_name', 'email', 'phone', 'paystack_transaction_id')`,
    ),
  );
  await migrated.destroy();

  assert.equal(afterMigration.length, 2);
  const kept = afterMigration[0];
  assert.ok(kept);
  assert.equal(kept.first_name, longName);
  assert.equal(kept.last_name, 'Okafor');
  assert.equal(kept.email, longEmail);
  assert.equal(kept.phone, '+2348012345678');
  assert.equal(kept.amount, 15000);
  assert.equal(kept.payment_status, 'success');
  assert.equal(kept.paystack_reference, 'EF-KEEP-1');
  assert.equal(kept.program, 'Core 3.0');
  assert.deepEqual(kept.form, { firstName: 'kept' });
  assert.deepEqual(kept.price_snapshot, []);
  assert.equal(Number(courseCount[0]?.count), 0);
  assert.equal(Number(templateCount[0]?.count), 0);
  const second = afterMigration[1];
  assert.ok(second);
  assert.equal(second.first_name, 'Chinedu');
  assert.equal(second.phone, null);
  assert.equal(second.program, 'Core 3.0');

  const lengthByColumn = new Map(
    lengths.map((row) => [row.column_name, row.character_maximum_length]),
  );
  assert.equal(lengthByColumn.get('first_name'), null);
  assert.equal(lengthByColumn.get('paystack_transaction_id'), 64);

  const synced = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: true,
    migrationsRun: true,
    migrations,
    entities: [EnterFirstEnrollmentEntity],
  });
  await synced.initialize();
  const afterSync = rowsOf(
    await synced.query(
      `SELECT first_name, email, amount FROM enter_first_enrollment WHERE paystack_reference = 'EF-KEEP-1'`,
    ),
  );
  await synced.destroy();
  const syncedRow = afterSync[0];
  assert.ok(syncedRow);
  assert.equal(syncedRow.first_name, longName);
  assert.equal(syncedRow.email, longEmail);
  assert.equal(syncedRow.amount, 15000);
  console.log('enrollment schema boot ok (synchronize off, rows preserved)');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
