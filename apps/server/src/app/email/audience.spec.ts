import { resolveAudience, type AudienceEnrollment } from './audience';

const now = new Date('2026-10-01T12:00:00.000Z');

function row(partial: Partial<AudienceEnrollment>): AudienceEnrollment {
  const id = partial.id ?? '1';
  return {
    id,
    email: partial.email ?? 'ada@example.com',
    tracks: partial.tracks ?? ['iot'],
    cohorts: partial.cohorts ?? ['iot'],
    paymentStatus: partial.paymentStatus ?? 'success',
    marketingOptIn: partial.marketingOptIn ?? true,
    createdAt: partial.createdAt ?? new Date('2026-09-30T12:00:00.000Z'),
    paystackReference: partial.paystackReference ?? `EF-${id}`,
  };
}

describe('resolveAudience', () => {
  const rows = [
    row({ id: '1', email: 'ada@example.com', marketingOptIn: true }),
    row({
      id: '2',
      email: 'ben@example.com',
      marketingOptIn: false,
      paymentStatus: 'pending',
      tracks: ['ai'],
      createdAt: new Date('2026-09-29T00:00:00.000Z'),
    }),
    row({ id: '3', email: 'cy@example.com', marketingOptIn: true }),
  ];

  it('counts marketing exclusions and suppressions', () => {
    const result = resolveAudience({
      rows,
      audience: { kind: 'all' },
      suppressed: new Set(['cy@example.com']),
      marketing: true,
      now,
    });
    expect(result.recipients.map((item) => item.email)).toEqual([
      'ada@example.com',
    ]);
    expect(result.excludedSuppressed).toBe(1);
    expect(result.excludedOptOut).toBe(1);
    expect(result.matched).toBe(3);
  });

  it('filters pending enrollments older than N hours', () => {
    const result = resolveAudience({
      rows,
      audience: {
        kind: 'filter',
        filter: { pendingHours: 24, track: 'ai' },
      },
      suppressed: new Set(),
      marketing: false,
      now,
    });
    expect(result.recipients.map((item) => item.id)).toEqual(['2']);
  });

  it('selects an explicit reference', () => {
    const result = resolveAudience({
      rows,
      audience: { kind: 'explicit', references: ['EF-1'] },
      suppressed: new Set(),
      marketing: false,
      now,
    });
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]?.email).toBe('ada@example.com');
  });
});
