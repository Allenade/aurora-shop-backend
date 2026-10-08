const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedSelector =
  | { type: 'allPaid' }
  | { type: 'course'; courseId: string }
  | { type: 'ageGroup'; min: number; max: number }
  | { type: 'student'; enrollmentId?: string; email?: string };

export type ComposeCandidate = {
  email: string;
  name: string;
  enrollmentId: string | null;
  courses: string[];
  marketingOptIn: boolean;
};

const AGE_MAX = 130;

export function parseAgeGroup(
  raw: string,
): { min: number; max: number } | null {
  const body = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!body) return null;
  const minMax = /^min[:=](\d+)(?:,max[:=](\d+))?$/.exec(body);
  if (minMax) {
    return ordered(
      Number(minMax[1]),
      minMax[2] != null ? Number(minMax[2]) : AGE_MAX,
    );
  }
  const maxMin = /^max[:=](\d+)(?:,min[:=](\d+))?$/.exec(body);
  if (maxMin) {
    return ordered(
      maxMin[2] != null ? Number(maxMin[2]) : 0,
      Number(maxMin[1]),
    );
  }
  const plus = /^(\d+)\+$/.exec(body);
  if (plus) return ordered(Number(plus[1]), AGE_MAX);
  const range = /^(\d+)-(\d+)$/.exec(body);
  if (range) return ordered(Number(range[1]), Number(range[2]));
  const exact = /^(\d+)$/.exec(body);
  if (exact) {
    const age = Number(exact[1]);
    return ordered(age, age);
  }
  return null;
}

export function parseSelector(raw: string): ParsedSelector {
  const token = raw.trim();
  if (!token) throw new Error('Selector is empty');
  if (token === 'allPaid') return { type: 'allPaid' };
  if (token.startsWith('course:')) {
    const courseId = token.slice('course:'.length).trim();
    if (!UUID_RE.test(courseId)) {
      throw new Error(`course selector needs a course id: ${token}`);
    }
    return { type: 'course', courseId };
  }
  if (token.startsWith('ageGroup:')) {
    const spec = parseAgeGroup(token.slice('ageGroup:'.length));
    if (!spec) throw new Error(`Invalid age group: ${token}`);
    return { type: 'ageGroup', min: spec.min, max: spec.max };
  }
  if (token.startsWith('student:')) {
    const value = token.slice('student:'.length).trim();
    if (!value) throw new Error('student selector is empty');
    if (UUID_RE.test(value)) return { type: 'student', enrollmentId: value };
    return { type: 'student', email: value.toLowerCase() };
  }
  throw new Error(`Unknown selector: ${token}`);
}

export function parseSelectors(selectors: string[]): ParsedSelector[] {
  return selectors.map(parseSelector);
}

/**
 * One row per email address. Course titles from every matching selector are kept.
 * Marketing opt-in is true when any source enrollment opted in.
 */
export function dedupeComposeRecipients(
  rows: ComposeCandidate[],
): ComposeCandidate[] {
  const byEmail = new Map<string, ComposeCandidate>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        email,
        name: row.name.trim(),
        enrollmentId: row.enrollmentId,
        courses: uniqueCourses(row.courses),
        marketingOptIn: row.marketingOptIn,
      });
      continue;
    }
    if (!existing.name && row.name.trim()) existing.name = row.name.trim();
    if (!existing.enrollmentId && row.enrollmentId) {
      existing.enrollmentId = row.enrollmentId;
    }
    existing.marketingOptIn = existing.marketingOptIn || row.marketingOptIn;
    for (const course of row.courses) {
      if (course && !existing.courses.includes(course))
        existing.courses.push(course);
    }
  }
  return [...byEmail.values()];
}

function uniqueCourses(courses: string[]): string[] {
  const out: string[] = [];
  for (const course of courses) {
    if (course && !out.includes(course)) out.push(course);
  }
  return out;
}

function ordered(
  min: number,
  max: number,
): { min: number; max: number } | null {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  if (min < 0 || max < 0 || min > max || max > AGE_MAX) return null;
  return { min, max };
}
