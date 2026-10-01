import { spawnSync } from 'node:child_process';

describe('enrollment schema boot', () => {
  it('migrates a pre-PR enrollment table without losing rows, with synchronize off', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'ts-node',
        '-r',
        'tsconfig-paths/register',
        'apps/server/src/app/enter-first/enrollment-schema-boot.run.ts',
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
    expect(result.stdout).toContain('enrollment schema boot ok');
  });
});
