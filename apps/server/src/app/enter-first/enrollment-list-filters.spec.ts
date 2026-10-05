import { completedAge } from './age';
import { enrollmentsToCsv } from './enrollment-csv';
import {
  EnrollmentQueryError,
  applyEnrollmentFilters,
  parseEnrollmentListQuery,
  splitTrackTokens,
} from './enrollment-list-filters';

function recorder() {
  const calls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const qb = {
    calls,
    andWhere(sql: string, params?: Record<string, unknown>) {
      calls.push({ sql, params });
      return qb;
    },
  };
  return qb;
}

describe('enrollment list filters', () => {
  it('filters by track slug, minor flag, payment status, and an inclusive day', () => {
    const parsed = parseEnrollmentListQuery({
      q: 'ada',
      paymentStatus: 'success, pending',
      track: 'iot, mobile',
      courseId: '11111111-1111-4111-8111-111111111111',
      isMinor: 'true',
      age: '16',
      from: '2026-10-01',
      to: '2026-10-05',
    });
    expect(parsed.program).toBe('Core 3.0');
    expect(parsed.paymentStatuses).toEqual(['success', 'pending']);
    expect(parsed.trackTokens).toEqual([
      'iot',
      'mobile',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(parsed.isMinor).toBe(true);
    expect(parsed.ageMin).toBe(16);
    expect(parsed.ageMax).toBe(16);
    expect(parsed.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parsed.to?.toISOString()).toBe('2026-10-05T23:59:59.999Z');
    expect(splitTrackTokens(parsed.trackTokens)).toEqual({
      ids: ['11111111-1111-4111-8111-111111111111'],
      slugs: ['iot', 'mobile'],
    });

    const qb = recorder();
    applyEnrollmentFilters(qb, {
      ...parsed,
      trackSlugs: ['iot', 'mobile'],
    });
    const sql = qb.calls.map((call) => call.sql).join('\n');
    expect(sql).toContain('LOWER(e.program) = LOWER(:program)');
    expect(sql).toContain('e.payment_status IN (:...paymentStatuses)');
    expect(sql).toContain('e.first_name ILIKE :q');
    expect(sql).toContain('e.tracks @> CAST(:track0 AS jsonb)');
    expect(sql).toContain('e.tracks @> CAST(:track1 AS jsonb)');
    expect(sql).toContain('e.is_minor = :isMinor');
    expect(sql).toContain('EXTRACT(YEAR FROM age(e.date_of_birth::timestamp))');
    expect(sql).toContain('e.created_at >= :from');
    expect(sql).toContain('e.created_at <= :to');
  });

  it('treats an unknown payment status or unresolved-only course as no rows', () => {
    expect(parseEnrollmentListQuery({ paymentStatus: 'nope' }).forceEmpty).toBe(
      true,
    );
    const qb = recorder();
    applyEnrollmentFilters(qb, { forceEmpty: true, trackSlugs: ['iot'] });
    expect(qb.calls).toEqual([{ sql: '1 = 0', params: undefined }]);
  });

  it('accepts date of birth, unknown age, and paid_at bounds', () => {
    const parsed = parseEnrollmentListQuery({
      isMinor: 'unknown',
      dateOfBirth: '2012-04-03',
      dobFrom: '2010-01-01',
      dobTo: '2014-12-31',
      ageMin: '11',
      ageMax: '17',
      paidFrom: '2026-10-01T00:00:00.000Z',
      paidTo: '2026-10-02T00:00:00.000Z',
      course: ['vision', 'arm'],
    });
    expect(parsed.isMinor).toBe('unknown');
    expect(parsed.dateOfBirth).toBe('2012-04-03');
    expect(parsed.trackTokens).toEqual(['vision', 'arm']);
    const qb = recorder();
    applyEnrollmentFilters(qb, { ...parsed, trackSlugs: parsed.trackTokens });
    const sql = qb.calls.map((call) => call.sql).join('\n');
    expect(sql).toContain('e.is_minor IS NULL');
    expect(sql).toContain('e.date_of_birth = :dateOfBirth');
    expect(sql).toContain('e.date_of_birth >= :dobFrom');
    expect(sql).toContain('e.paid_at >= :paidFrom');
  });

  it('defaults a blank program to Core 3.0 and keeps an explicit name', () => {
    expect(parseEnrollmentListQuery({}).program).toBe('Core 3.0');
    expect(parseEnrollmentListQuery({ program: '  ' }).program).toBe(
      'Core 3.0',
    );
    expect(parseEnrollmentListQuery({ program: 'Later' }).program).toBe(
      'Later',
    );
  });

  it('rejects an inverted age range and a bad isMinor value', () => {
    expect(() =>
      parseEnrollmentListQuery({ ageMin: '18', ageMax: '10' }),
    ).toThrow(EnrollmentQueryError);
    expect(() => parseEnrollmentListQuery({ isMinor: 'maybe' })).toThrow(
      EnrollmentQueryError,
    );
  });
});

describe('enrollment csv', () => {
  const now = new Date('2026-10-05T00:00:00.000Z');

  it('returns Excel-friendly rows for the filtered enrollment fields', () => {
    const csv = enrollmentsToCsv(
      [
        {
          id: 'enr-1',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
          phone: '+2348012345678',
          tracks: ['iot', 'mobile'],
          amount: 15000,
          currency: 'NGN',
          paymentStatus: 'success',
          paystackReference: 'EF-1',
          marketingOptIn: false,
          isMinor: true,
          amountMismatch: false,
          dateOfBirth: '2012-04-03',
          ageConfirmed: true,
          guardianName: 'Ngozi Okafor',
          guardianEmail: 'ngozi@example.com',
          createdAt: now,
          paidAt: now,
        },
      ],
      false,
      now,
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('phone,program,tracks');
    expect(csv).toContain('Core 3.0');
    expect(csv).toContain('\r\n');
    expect(csv).toContain(
      'dateOfBirth,age,ageConfirmed,guardianName,guardianEmail',
    );
    expect(csv).toContain('iot|mobile');
    expect(csv).toContain('2012-04-03,14,true');
    expect(completedAge('2012-04-03', now)).toBe(14);
  });

  it('masks registrant PII and quotes commas', () => {
    const csv = enrollmentsToCsv(
      [
        {
          id: 'enr-2',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
          tracks: [],
          amount: 0,
          currency: 'NGN',
          paymentStatus: 'pending',
          paystackReference: 'EF,1',
          marketingOptIn: true,
          amountMismatch: false,
          dateOfBirth: '2012-04-03',
          isMinor: true,
          guardianEmail: 'ngozi@example.com',
          createdAt: now,
        },
      ],
      true,
      now,
    );
    expect(csv).toContain('A***');
    expect(csv).toContain('"EF,1"');
    expect(csv).toContain('a***@example.com');
    expect(csv).not.toContain('2012-04-03');
    expect(csv).not.toContain(',14,');
  });
});
