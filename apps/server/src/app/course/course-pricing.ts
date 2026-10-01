export type CourseStatus = 'draft' | 'open' | 'closed' | 'archived';

export type PricedCourse = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  isFree: boolean;
  status: CourseStatus;
  seatCap: number | null;
  seatsTaken: number;
  enrollmentCutoff: Date | null;
};

export type QuoteLine = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  isFree: boolean;
  enrollmentCutoff: string | null;
};

export function quoteCourses(
  slugs: string[],
  courses: PricedCourse[],
  now = new Date(),
):
  | { ok: true; amount: number; currency: string; lines: QuoteLine[] }
  | { ok: false; error: string } {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) return { ok: false, error: 'Select at least one track' };

  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const unknown = unique.filter((slug) => !bySlug.has(slug));
  if (unknown.length) {
    return { ok: false, error: `Unknown track(s): ${unknown.join(', ')}` };
  }

  const lines: QuoteLine[] = [];
  for (const slug of unique) {
    const course = bySlug.get(slug)!;
    if (course.status !== 'open') {
      return {
        ok: false,
        error: `Course ${course.slug} is not open for enrollment`,
      };
    }
    if (
      course.enrollmentCutoff &&
      now.getTime() > course.enrollmentCutoff.getTime()
    ) {
      return {
        ok: false,
        error: `Enrollment for ${course.slug} is past the cutoff`,
      };
    }
    if (
      course.seatCap != null &&
      course.seatCap >= 0 &&
      course.seatsTaken >= course.seatCap
    ) {
      return { ok: false, error: `Course ${course.slug} is full` };
    }
    const price = course.isFree ? 0 : course.price;
    lines.push({
      slug: course.slug,
      name: course.name,
      price,
      currency: course.currency,
      isFree: course.isFree || price <= 0,
      enrollmentCutoff: course.enrollmentCutoff
        ? course.enrollmentCutoff.toISOString()
        : null,
    });
  }

  const currencies = new Set(lines.map((line) => line.currency.toUpperCase()));
  if (currencies.size > 1) {
    return { ok: false, error: 'Selected courses use different currencies' };
  }
  const amount = lines.reduce((sum, line) => sum + line.price, 0);
  return {
    ok: true,
    amount,
    currency: lines[0]?.currency ?? 'NGN',
    lines,
  };
}
