import { readFileSync } from 'fs';
import { join } from 'path';
import { CORE_30_PROGRAM, resolveProgram } from './core30';

describe('Core 3.0 program', () => {
  it('uses the folder name Core 3.0', () => {
    expect(CORE_30_PROGRAM).toBe('Core 3.0');
  });

  it('defaults a missing program to Core 3.0', () => {
    expect(resolveProgram(undefined)).toBe(CORE_30_PROGRAM);
    expect(resolveProgram(null)).toBe(CORE_30_PROGRAM);
    expect(resolveProgram('   ')).toBe(CORE_30_PROGRAM);
  });

  it('keeps an explicit program name', () => {
    expect(resolveProgram(' Core 3.0 ')).toBe('Core 3.0');
    expect(resolveProgram('Later program')).toBe('Later program');
  });

  it('does not teach the shop seed to insert courses or email templates', () => {
    const source = readFileSync(
      join(__dirname, '../seed/seed.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /CourseEntity|email_template|enter_first_enrollment/,
    );
  });
});
