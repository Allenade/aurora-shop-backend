import { CORE_30_PROGRAM } from '../program/core30';
import {
  applyEnrollmentFilters,
  parseEnrollmentFilters,
  splitCourseTokens,
} from './enrollment-filters';

describe('enrollment program and course filters', () => {
  it('defaults the program to Core 3.0 and collects course tokens', () => {
    const parsed = parseEnrollmentFilters({
      course: 'Robotics, vision',
      track: ['arm'],
      courseId: '6f1e1c2a-1111-4111-8111-111111111111',
    });
    expect(parsed.program).toBe(CORE_30_PROGRAM);
    expect(parsed.courseTokens).toEqual([
      'Robotics',
      'vision',
      'arm',
      '6f1e1c2a-1111-4111-8111-111111111111',
    ]);
  });

  it('keeps an explicit program and rejects an inverted date range', () => {
    expect(parseEnrollmentFilters({ program: 'Later' }).program).toBe('Later');
    expect(() =>
      parseEnrollmentFilters({
        from: '2026-02-02T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow('from must be on or before to');
  });

  it('splits course ids from slugs', () => {
    expect(
      splitCourseTokens([
        'Robotics',
        '6f1e1c2a-1111-4111-8111-111111111111',
        'robotics',
      ]),
    ).toEqual({
      ids: ['6f1e1c2a-1111-4111-8111-111111111111'],
      slugs: ['robotics'],
    });
  });

  it('filters by program and any selected track', () => {
    const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
    applyEnrollmentFilters(
      {
        andWhere(sql, params) {
          calls.push({ sql, params });
        },
      },
      {
        program: CORE_30_PROGRAM,
        trackSlugs: ['robotics', 'vision'],
        paymentStatuses: ['success'],
      },
    );
    expect(calls[0]).toEqual({
      sql: 'LOWER(e.program) = LOWER(:program)',
      params: { program: 'Core 3.0' },
    });
    expect(calls[1]?.sql).toContain('e.payment_status IN');
    expect(calls[2]?.sql).toContain('e.tracks @> CAST(:track0 AS jsonb)');
    expect(calls[2]?.sql).toContain('OR');
    expect(calls[2]?.params).toEqual({
      track0: '["robotics"]',
      track1: '["vision"]',
    });
  });

  it('matches nothing when the course filter cannot be resolved', () => {
    const calls: string[] = [];
    applyEnrollmentFilters(
      {
        andWhere(sql) {
          calls.push(sql);
        },
      },
      { program: CORE_30_PROGRAM, forceEmpty: true },
    );
    expect(calls).toEqual(['1 = 0']);
  });
});
