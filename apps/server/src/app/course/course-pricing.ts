export type CourseStatus = 'draft' | 'open' | 'closed' | 'archived';

export type CourseQuoteInput = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  isFree: boolean;
  status: CourseStatus;
  seatCap: number | null;
  seatsTaken: number;
  enrollmentCutoff: Date | null;
  startDate: Date | null;
};

export type ChargedLine = {
  slug: string;
  name: string;
  price: number;
  currency: string;
};

export function cohortKey(course: {
  slug: string;
  startDate: Date | null;
}): string {
  if (!course.startDate) return course.slug;
  const year = course.startDate.getUTCFullYear();
  const month = String(course.startDate.getUTCMonth() + 1).padStart(2, '0');
  return `${course.slug}:${year}-${month}`;
}

export function quoteCourses(
  courses: CourseQuoteInput[],
  requested: string[],
  now: Date,
): {
  amount: number;
  currency: string;
  lines: ChargedLine[];
  cohorts: string[];
  errors: string[];
} {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const errors: string[] = [];
  const lines: ChargedLine[] = [];
  const cohorts: string[] = [];
  let currency = 'NGN';

  for (const slug of requested) {
    const course = bySlug.get(slug);
    if (!course) {
      errors.push(`Unknown track: ${slug}`);
      continue;
    }
    if (course.status !== 'open') {
      errors.push(`${course.name} is ${course.status}`);
      continue;
    }
    if (
      course.enrollmentCutoff &&
      course.enrollmentCutoff.getTime() < now.getTime()
    ) {
      errors.push(`${course.name} is past the enrollment cutoff`);
      continue;
    }
    if (
      course.seatCap != null &&
      course.seatCap >= 0 &&
      course.seatsTaken >= course.seatCap
    ) {
      errors.push(`${course.name} is full`);
      continue;
    }
    const price = course.isFree ? 0 : course.price;
    if (lines.length === 0) currency = course.currency;
    else if (course.currency.toUpperCase() !== currency.toUpperCase()) {
      errors.push(`${course.name} uses ${course.currency}, not ${currency}`);
      continue;
    }
    lines.push({
      slug: course.slug,
      name: course.name,
      price,
      currency: course.currency,
    });
    cohorts.push(cohortKey(course));
  }

  const amount = lines.reduce((sum, line) => sum + line.price, 0);
  return { amount, currency, lines, cohorts, errors };
}

export function courseDeleteBlock(
  status: string,
  enrollmentCount: number,
): string | null {
  if (status !== 'draft') {
    return 'Only draft courses with no enrollments can be deleted';
  }
  if (enrollmentCount > 0) {
    return 'Courses with enrollments cannot be deleted';
  }
  return null;
}

export function courseArchiveBlock(enrollmentCount: number): string | null {
  if (enrollmentCount < 1) {
    return 'Archive is only available once a course has enrollments';
  }
  return null;
}
