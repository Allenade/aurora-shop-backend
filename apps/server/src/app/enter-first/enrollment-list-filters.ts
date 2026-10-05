const PAYMENT_STATUSES = new Set(['pending', 'success', 'failed', 'refunded']);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENROLLMENT_EXPORT_ROW_CAP = 20000;

export const ENROLLMENT_LIST_QUERY_DOCS = [
  'q matches first name, last name, email, or Paystack reference.',
  'paymentStatus is pending, success, failed, or refunded (comma-separated).',
  'track, course, courseId, and courseSlug accept a course slug or id, comma-separated or repeated. A row matches when tracks contains any of them.',
  'isMinor is true, false, or unknown.',
  'dateOfBirth is an exact YYYY-MM-DD. dobFrom and dobTo bound date_of_birth.',
  'age is completed years. ageMin and ageMax bound the same calendar age from date_of_birth.',
  'from and to bound created_at. paidFrom and paidTo bound paid_at. A YYYY-MM-DD value covers that whole UTC day; other values are ISO timestamps.',
  'page and limit apply to the list (limit max 100).',
].join(' ');

export class EnrollmentQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrollmentQueryError';
  }
}

export type RawQueryValue = string | string[] | undefined;

export type EnrollmentListQuery = {
  q?: RawQueryValue;
  paymentStatus?: RawQueryValue;
  track?: RawQueryValue;
  course?: RawQueryValue;
  courseId?: RawQueryValue;
  courseSlug?: RawQueryValue;
  isMinor?: RawQueryValue;
  dateOfBirth?: RawQueryValue;
  dobFrom?: RawQueryValue;
  dobTo?: RawQueryValue;
  age?: RawQueryValue;
  ageMin?: RawQueryValue;
  ageMax?: RawQueryValue;
  from?: RawQueryValue;
  to?: RawQueryValue;
  paidFrom?: RawQueryValue;
  paidTo?: RawQueryValue;
  page?: RawQueryValue;
  limit?: RawQueryValue;
};

export type ParsedEnrollmentListQuery = {
  q?: string;
  paymentStatuses?: string[];
  trackTokens: string[];
  isMinor?: boolean | 'unknown';
  dateOfBirth?: string;
  dobFrom?: string;
  dobTo?: string;
  ageMin?: number;
  ageMax?: number;
  from?: Date;
  to?: Date;
  paidFrom?: Date;
  paidTo?: Date;
  page?: number;
  limit?: number;
  forceEmpty: boolean;
};

export type EnrollmentFilterInput = {
  q?: string;
  paymentStatuses?: string[];
  trackSlugs?: string[];
  forceEmpty?: boolean;
  isMinor?: boolean | 'unknown';
  dateOfBirth?: string;
  dobFrom?: string;
  dobTo?: string;
  ageMin?: number;
  ageMax?: number;
  from?: Date;
  to?: Date;
  paidFrom?: Date;
  paidTo?: Date;
};

type Whereable = {
  andWhere(sql: string, params?: Record<string, unknown>): unknown;
};

export function parseEnrollmentListQuery(
  query: EnrollmentListQuery,
): ParsedEnrollmentListQuery {
  const payment = parsePaymentStatuses(one(query.paymentStatus));
  const age = parseAgeRange(query);
  const created = parseTimestampRange(one(query.from), one(query.to), 'from');
  const paid = parseTimestampRange(
    one(query.paidFrom),
    one(query.paidTo),
    'paidFrom',
  );
  const dateOfBirth = parseIsoDate(one(query.dateOfBirth), 'dateOfBirth');
  const dobFrom = parseIsoDate(one(query.dobFrom), 'dobFrom');
  const dobTo = parseIsoDate(one(query.dobTo), 'dobTo');
  if (dobFrom && dobTo && dobFrom > dobTo) {
    throw new EnrollmentQueryError('dobFrom must be on or before dobTo');
  }
  return {
    q: one(query.q)?.trim() || undefined,
    paymentStatuses: payment.statuses,
    trackTokens: collectTrackTokens(
      query.track,
      query.course,
      query.courseId,
      query.courseSlug,
    ),
    isMinor: parseIsMinor(one(query.isMinor)),
    dateOfBirth,
    dobFrom,
    dobTo,
    ageMin: age.ageMin,
    ageMax: age.ageMax,
    from: created.from,
    to: created.to,
    paidFrom: paid.from,
    paidTo: paid.to,
    page: parsePositiveInt(one(query.page)),
    limit: parsePositiveInt(one(query.limit)),
    forceEmpty: payment.forceEmpty,
  };
}

export function splitTrackTokens(tokens: string[]): {
  ids: string[];
  slugs: string[];
} {
  const ids: string[] = [];
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (UUID_RE.test(token)) ids.push(token);
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
  if (filters.isMinor === 'unknown') {
    qb.andWhere('e.is_minor IS NULL');
  } else if (typeof filters.isMinor === 'boolean') {
    qb.andWhere('e.is_minor = :isMinor', { isMinor: filters.isMinor });
  }
  if (filters.dateOfBirth) {
    qb.andWhere('e.date_of_birth = :dateOfBirth', {
      dateOfBirth: filters.dateOfBirth,
    });
  }
  if (filters.dobFrom) {
    qb.andWhere('e.date_of_birth >= :dobFrom', { dobFrom: filters.dobFrom });
  }
  if (filters.dobTo) {
    qb.andWhere('e.date_of_birth <= :dobTo', { dobTo: filters.dobTo });
  }
  if (filters.ageMin != null || filters.ageMax != null) {
    const parts = ['e.date_of_birth IS NOT NULL'];
    const params: Record<string, unknown> = {};
    if (filters.ageMin != null) {
      parts.push(
        'EXTRACT(YEAR FROM age(e.date_of_birth::timestamp)) >= :ageMin',
      );
      params.ageMin = filters.ageMin;
    }
    if (filters.ageMax != null) {
      parts.push(
        'EXTRACT(YEAR FROM age(e.date_of_birth::timestamp)) <= :ageMax',
      );
      params.ageMax = filters.ageMax;
    }
    qb.andWhere(parts.join(' AND '), params);
  }
  if (filters.from)
    qb.andWhere('e.created_at >= :from', { from: filters.from });
  if (filters.to) qb.andWhere('e.created_at <= :to', { to: filters.to });
  if (filters.paidFrom) {
    qb.andWhere('e.paid_at >= :paidFrom', { paidFrom: filters.paidFrom });
  }
  if (filters.paidTo) {
    qb.andWhere('e.paid_at <= :paidTo', { paidTo: filters.paidTo });
  }
}

function collectTrackTokens(...values: RawQueryValue[]): string[] {
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

function parsePaymentStatuses(value?: string): {
  statuses?: string[];
  forceEmpty: boolean;
} {
  if (!value?.trim()) return { forceEmpty: false };
  const requested = value
    .split(',')
    .map((status) => status.trim().toLowerCase())
    .filter(Boolean);
  const statuses = [
    ...new Set(requested.filter((status) => PAYMENT_STATUSES.has(status))),
  ];
  if (!statuses.length) return { forceEmpty: true };
  return { statuses, forceEmpty: false };
}

function parseIsMinor(value?: string): boolean | 'unknown' | undefined {
  if (value == null || value.trim() === '') return undefined;
  const text = value.trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  if (text === 'unknown') return 'unknown';
  throw new EnrollmentQueryError('isMinor must be true, false, or unknown');
}

function parseAgeRange(query: EnrollmentListQuery): {
  ageMin?: number;
  ageMax?: number;
} {
  const exact = parseAgeBound(one(query.age), 'age');
  let ageMin = parseAgeBound(one(query.ageMin), 'ageMin');
  let ageMax = parseAgeBound(one(query.ageMax), 'ageMax');
  if (exact != null) {
    ageMin = ageMin ?? exact;
    ageMax = ageMax ?? exact;
  }
  if (ageMin != null && ageMax != null && ageMin > ageMax) {
    throw new EnrollmentQueryError(
      'ageMin must be less than or equal to ageMax',
    );
  }
  return { ageMin, ageMax };
}

function parseAgeBound(value: string | undefined, label: string) {
  if (value == null || value.trim() === '') return undefined;
  if (!/^\d{1,3}$/.test(value.trim())) {
    throw new EnrollmentQueryError(`${label} must be a whole number of years`);
  }
  const age = Number(value.trim());
  if (age > 120) {
    throw new EnrollmentQueryError(`${label} must be between 0 and 120`);
  }
  return age;
}

function parseIsoDate(value: string | undefined, label: string) {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new EnrollmentQueryError(`${label} must be YYYY-MM-DD`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new EnrollmentQueryError(`${label} must be YYYY-MM-DD`);
  }
  return text;
}

function parseTimestampRange(
  fromValue: string | undefined,
  toValue: string | undefined,
  fromLabel: string,
) {
  const toLabel = fromLabel === 'from' ? 'to' : 'paidTo';
  const from = parseTimestamp(fromValue, fromLabel, false);
  const to = parseTimestamp(toValue, toLabel, true);
  if (from && to && from.getTime() > to.getTime()) {
    throw new EnrollmentQueryError(
      `${fromLabel} must be on or before ${toLabel}`,
    );
  }
  return { from, to };
}

function parseTimestamp(
  value: string | undefined,
  label: string,
  endOfDay: boolean,
) {
  if (!value?.trim()) return undefined;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    parseIsoDate(text, label);
    const date = new Date(`${text}T00:00:00.000Z`);
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new EnrollmentQueryError(
      `${label} must be an ISO timestamp or YYYY-MM-DD`,
    );
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
