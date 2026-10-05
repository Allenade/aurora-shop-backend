import { readFileSync } from 'fs';
import { spawnSync } from 'node:child_process';
import { join } from 'path';

describe('audit log schema boot', () => {
  it('adds ip, user agent, and request id without deleting rows', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'libs/shared/src/database/migrations/1735690000000-AuditLogColumns.ts',
      ),
      'utf8',
    );
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "ip" character varying(64)',
    );
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "user_agent" character varying(512)',
    );
    expect(source).toContain(
      'ADD COLUMN IF NOT EXISTS "request_id" character varying(80)',
    );
    expect(source).not.toMatch(/DROP TABLE/i);
    expect(source).not.toMatch(/DELETE FROM/i);
    expect(source).not.toMatch(/TRUNCATE/i);

    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'ts-node',
        '-r',
        'tsconfig-paths/register',
        'apps/server/src/app/audit-log/audit-log-schema-boot.run.ts',
      ],
      {
        encoding: 'utf8',
        env: process.env,
        cwd: process.cwd(),
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `${result.stdout}\n${result.stderr}\nexit ${String(result.status)}`,
      );
    }
    expect(result.stdout).toContain('audit log schema boot ok');
  });
});
