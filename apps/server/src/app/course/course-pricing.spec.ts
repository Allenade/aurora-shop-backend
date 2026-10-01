import { quoteCourses, type PricedCourse } from './course-pricing';

function course(overrides: Partial<PricedCourse> = {}): PricedCourse {
  return {
    slug: 'iot',
    name: 'Internet of Things',
    price: 60_000,
    currency: 'NGN',
    isFree: false,
    status: 'open',
    seatCap: 10,
    seatsTaken: 0,
    enrollmentCutoff: null,
    ...overrides,
  };
}

describe('course pricing', () => {
  it('charges the server-side course price', () => {
    const quote = quoteCourses(
      ['iot', 'mobile'],
      [course(), course({ slug: 'mobile', name: 'Mobile', price: 45_000 })],
    );
    expect(quote.ok).toBe(true);
    if (quote.ok) expect(quote.amount).toBe(105_000);
  });

  it('rejects unknown, closed, full, and past-cutoff courses', () => {
    expect(quoteCourses(['nope'], [course()]).ok).toBe(false);
    expect(quoteCourses(['iot'], [course({ status: 'closed' })]).ok).toBe(
      false,
    );
    expect(
      quoteCourses(['iot'], [course({ seatCap: 1, seatsTaken: 1 })]).ok,
    ).toBe(false);
    expect(
      quoteCourses(
        ['iot'],
        [course({ enrollmentCutoff: new Date('2020-01-01T00:00:00Z') })],
        new Date('2026-01-01T00:00:00Z'),
      ).ok,
    ).toBe(false);
  });

  it('charges nothing for a free course', () => {
    const quote = quoteCourses(
      ['iot'],
      [course({ isFree: true, price: 60_000 })],
    );
    expect(quote.ok).toBe(true);
    if (quote.ok) expect(quote.amount).toBe(0);
  });
});
