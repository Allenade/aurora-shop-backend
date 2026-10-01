import {
  courseArchiveBlock,
  courseDeleteBlock,
  quoteCourses,
  type CourseQuoteInput,
} from './course-pricing';

function course(partial: Partial<CourseQuoteInput> = {}): CourseQuoteInput {
  return {
    slug: 'iot',
    name: 'Internet of Things',
    price: 60_000,
    currency: 'NGN',
    isFree: false,
    status: 'open',
    seatCap: 20,
    seatsTaken: 0,
    enrollmentCutoff: null,
    startDate: null,
    ...partial,
  };
}

const now = new Date('2026-10-01T00:00:00.000Z');

describe('quoteCourses', () => {
  it('prices selected tracks from the catalogue', () => {
    const quote = quoteCourses(
      [course(), course({ slug: 'ai', name: 'Artificial Intelligence' })],
      ['iot', 'ai'],
      now,
    );
    expect(quote.errors).toEqual([]);
    expect(quote.amount).toBe(120_000);
    expect(quote.lines.map((line) => line.slug)).toEqual(['iot', 'ai']);
  });

  it('rejects closed, full, past-cutoff, and unknown tracks', () => {
    const quote = quoteCourses(
      [
        course({ status: 'closed' }),
        course({
          slug: 'ai',
          name: 'Artificial Intelligence',
          seatsTaken: 2,
          seatCap: 2,
        }),
        course({
          slug: 'arm',
          name: 'ARM',
          enrollmentCutoff: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ],
      ['iot', 'ai', 'arm', 'missing'],
      now,
    );
    expect(quote.errors.join(' ')).toMatch(/closed/);
    expect(quote.errors.join(' ')).toMatch(/full/);
    expect(quote.errors.join(' ')).toMatch(/cutoff/);
    expect(quote.errors.join(' ')).toMatch(/Unknown track: missing/);
    expect(quote.amount).toBe(0);
  });

  it('charges nothing for a free course', () => {
    const quote = quoteCourses(
      [course({ isFree: true, price: 60_000 })],
      ['iot'],
      now,
    );
    expect(quote.amount).toBe(0);
    expect(quote.lines[0]?.price).toBe(0);
  });
});

describe('course removal rules', () => {
  it('deletes only empty drafts and archives only courses with enrollments', () => {
    expect(courseDeleteBlock('draft', 0)).toBeNull();
    expect(courseDeleteBlock('open', 0)).toMatch(/draft/);
    expect(courseDeleteBlock('draft', 2)).toMatch(/cannot be deleted/);
    expect(courseArchiveBlock(0)).toMatch(/enrollments/);
    expect(courseArchiveBlock(3)).toBeNull();
  });
});
