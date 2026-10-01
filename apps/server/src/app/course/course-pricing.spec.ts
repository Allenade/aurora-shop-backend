import {
  PUBLISH_WITHOUT_PRICE,
  isEnrollable,
  publishBlockReason,
  quoteCourses,
  type PricedCourse,
} from './course-pricing';

function course(overrides: Partial<PricedCourse> = {}): PricedCourse {
  return {
    slug: 'iot',
    name: 'Internet of Things',
    price: 25_000,
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
      [course(), course({ slug: 'mobile', name: 'Mobile', price: 40_000 })],
    );
    expect(quote.ok).toBe(true);
    if (quote.ok) expect(quote.amount).toBe(65_000);
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

  it('rejects unpublished courses and paid courses with no price', () => {
    const draft = quoteCourses(
      ['iot'],
      [course({ status: 'draft', price: 25_000 })],
    );
    expect(draft.ok).toBe(false);
    const unpaid = quoteCourses(['iot'], [course({ price: null })]);
    expect(unpaid.ok).toBe(false);
    if (!unpaid.ok) expect(unpaid.error).toContain('no price');
    expect(isEnrollable({ status: 'open', isFree: false, price: null })).toBe(
      false,
    );
    expect(
      isEnrollable({ status: 'draft', isFree: false, price: 25_000 }),
    ).toBe(false);
    expect(isEnrollable({ status: 'open', isFree: false, price: 25_000 })).toBe(
      true,
    );
  });

  it('charges nothing for a free course, including one with no stored price', () => {
    const quote = quoteCourses(
      ['iot'],
      [course({ isFree: true, price: null })],
    );
    expect(quote.ok).toBe(true);
    if (quote.ok) {
      expect(quote.amount).toBe(0);
      expect(quote.lines[0]?.isFree).toBe(true);
    }
    expect(isEnrollable({ status: 'open', isFree: true, price: null })).toBe(
      true,
    );
  });

  it('treats a numeric zero as a set price', () => {
    const quote = quoteCourses(['iot'], [course({ price: 0, isFree: false })]);
    expect(quote.ok).toBe(true);
    if (quote.ok) {
      expect(quote.amount).toBe(0);
      expect(quote.lines[0]?.isFree).toBe(false);
    }
  });

  it('rejects publishing a paid course without a price', () => {
    expect(
      publishBlockReason({ status: 'open', isFree: false, price: null }),
    ).toBe(PUBLISH_WITHOUT_PRICE);
    expect(
      publishBlockReason({ status: 'open', isFree: true, price: null }),
    ).toBeNull();
    expect(
      publishBlockReason({ status: 'draft', isFree: false, price: null }),
    ).toBeNull();
    expect(
      publishBlockReason({ status: 'open', isFree: false, price: 25_000 }),
    ).toBeNull();
  });
});
