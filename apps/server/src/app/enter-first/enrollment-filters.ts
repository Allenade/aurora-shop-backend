import { resolveProgram } from '../program/core30';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENROLLMENT_FILTER_DOCS = [
  'program defaults to Core 3.0. Pass another program name to use that folder.',
  'course, track, courseId, and courseSlug filter the course or track inside that program. A value may be a slug or id, comma-separated or repeated. A row matches when tracks contains any of them.',
  'Course options for these filters are rows in the course table (GET /admin/courses). Nothing is added when that table is empty.',
  'q matches first name, last name, email, or Paystack reference.',
  'paymentStatus is pending, success, failed, or refunded (comma-separated).',
  'from and to bound created_at. They are optional on the enrollment list. CSV export uses the last 30 days when they are omitted.',
  'page and limit apply to the list (limit max 100).',
].join(' ');

export class EnrollmentFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrollmentFilterError';
  }
}

export type RawQueryValue = string | string[] | undefined;

export type EnrollmentFilterQuery = {
  q?: RawQueryValue;
  paymentStatus?: RawQueryValue;
  program?: RawQueryValue;
  course?: RawQueryValue;
  track?: RawQueryValue;
  courseId?: RawQueryValue;
  courseSlug?: RawQueryValue;
  from?: RawQueryValue;
  to?: RawQueryValue;
  page?: RawQueryValue;
  limit?: RawQueryValue;
};

export type ParsedEnrollmentFilters = {
  q?: string;
  paymentStatuses?: string[];
  program: string;
  courseTokens: string[];
  fromRaw?: string;
  toRaw?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

export type EnrollmentFilterInput = {
  program: string;
  q?: string;
  paymentStatuses?: string[];
  trackSlugs?: string[];
  forceEmpty?: boolean;
  from?: Date;
  to?: Date;
};

type Whereable = {
  andWhere(sql: string, params?: Record<string, unknown>): unknown;
};

export function parseEnrollmentFilters(
  query: EnrollmentFilterQuery,
): ParsedEnrollmentFilters {
  const fromRaw = one(query.from)?.trim() || undefined;
  const toRaw = one(query.to)?.trim() || undefined;
  const from = parseTimestamp(fromRaw, 'from');
  const to = parseTimestamp(toRaw, 'to');
  if (from && to && from.getTime() > to.getTime()) {
    throw new EnrollmentFilterError('from must be on or before to');
  }
  return {
    q: one(query.q)?.trim() || undefined,
    paymentStatuses: parsePaymentStatuses(one(query.paymentStatus)),
    program: resolveProgram(one(query.program)),
    courseTokens: collectCourseTokens(
      query.course,
      query.track,
      query.courseId,
      query.courseSlug,
    ),
    fromRaw,
    toRaw,
    from,
    to,
    page: parsePositiveInt(one(query.page)),
    limit: parsePositiveInt(one(query.limit)),
  };
}

export function splitCourseTokens(tokens: string[]): {
  ids: string[];
  slugs: string[];
} {
  const ids: string[] = [];
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (UUID_RE.test(trimmed)) ids.push(trimmed);
    else slugs.push(key);
  }
  return { ids, slugs };
}

export function applyEnrollmentFilters(
  qb: Whereable,
  filters: EnrollmentFilterInput,
) {
  if (filters.forceEmpty) {
    qb.andWhere('1 = 0');
    return;
  }
  qb.andWhere('LOWER(e.program) = LOWER(:program)', {
    program: filters.program,
  });
  if (filters.paymentStatuses?.length) {
    qb.andWhere('e.payment_status IN (:...paymentStatuses)', {
      paymentStatuses: filters.paymentStatuses,
    });
  }
  const q = filters.q?.trim();
  if (q) {
    qb.andWhere(
      '(e.first_name ILIKE :q OR e.last_name ILIKE :q OR e.email ILIKE :q OR e.paystack_reference ILIKE :q)',
      { q: `%${q}%` },
    );
  }
  if (filters.trackSlugs?.length) {
    const params: Record<string, unknown> = {};
    const parts = filters.trackSlugs.map((slug, index) => {
      params[`track${index}`] = JSON.stringify([slug]);
      return `e.tracks @> CAST(:track${index} AS jsonb)`;
    });
    qb.andWhere(`(${parts.join(' OR ')})`, params);
  }
  if (filters.from) {
    qb.andWhere('e.created_at >= :from', { from: filters.from });
  }
  if (filters.to) {
    qb.andWhere('e.created_at <= :to', { to: filters.to });
  }
}

function collectCourseTokens(...values: RawQueryValue[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of list) {
      for (const part of item.split(',')) {
        const token = part.trim();
        if (token) out.push(token);
      }
    }
  }
  return out;
}

function parsePaymentStatuses(value?: string) {
  if (!value?.trim()) return undefined;
  const statuses = [
    ...new Set(
      value
        .split(',')
        .map((status) => status.trim())
        .filter(Boolean),
    ),
  ];
  return statuses.length ? statuses : undefined;
}

function parseTimestamp(value: string | undefined, label: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EnrollmentFilterError(`${label} is not a valid date`);
  }
  return date;
}

function parsePositiveInt(value?: string) {
  if (value == null || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function one(value: RawQueryValue) {
  if (Array.isArray(value)) return value[0];
  return value;
}
