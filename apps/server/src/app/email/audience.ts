export type AudienceFilter = {
  track?: string;
  paymentStatus?: string;
  pendingHours?: number;
  cohort?: string;
  createdFrom?: string;
  createdTo?: string;
  marketingOptIn?: boolean;
};

export type AudienceSpec =
  | { kind: 'all' }
  | { kind: 'filter'; filter: AudienceFilter }
  | { kind: 'segment'; segmentId: string }
  | {
      kind: 'explicit';
      ids?: string[];
      emails?: string[];
      references?: string[];
    };

export type AudienceEnrollment = {
  id: string;
  email: string;
  tracks: string[];
  cohorts: string[];
  paymentStatus: string;
  marketingOptIn: boolean;
  createdAt: Date;
  paystackReference?: string | null;
  firstName?: string;
  amount?: number;
  currency?: string;
  authorizationUrl?: string | null;
};

export function parseAudience(value: unknown): AudienceSpec {
  if (!value || typeof value !== 'object') {
    throw new Error('audience is required');
  }
  const body = value as {
    kind?: string;
    filter?: AudienceFilter;
    segmentId?: string;
    ids?: string[];
    emails?: string[];
    references?: string[];
  };
  if (body.kind === 'all') return { kind: 'all' };
  if (body.kind === 'filter')
    return { kind: 'filter', filter: body.filter ?? {} };
  if (body.kind === 'segment') {
    if (!body.segmentId) throw new Error('segmentId is required');
    return { kind: 'segment', segmentId: body.segmentId };
  }
  if (body.kind === 'explicit') {
    return {
      kind: 'explicit',
      ids: body.ids ?? [],
      emails: body.emails ?? [],
      references: body.references ?? [],
    };
  }
  throw new Error('Unknown audience kind');
}

export function matchesFilter(
  row: AudienceEnrollment,
  filter: AudienceFilter | undefined,
  now: Date,
): boolean {
  if (!filter) return true;
  if (filter.track && !row.tracks.includes(filter.track)) return false;
  if (filter.paymentStatus && row.paymentStatus !== filter.paymentStatus) {
    return false;
  }
  if (filter.cohort && !row.cohorts.includes(filter.cohort)) return false;
  if (
    filter.marketingOptIn != null &&
    row.marketingOptIn !== filter.marketingOptIn
  ) {
    return false;
  }
  if (filter.createdFrom && row.createdAt < new Date(filter.createdFrom)) {
    return false;
  }
  if (filter.createdTo && row.createdAt > new Date(filter.createdTo)) {
    return false;
  }
  if (filter.pendingHours != null) {
    if (row.paymentStatus !== 'pending') return false;
    const ageMs = now.getTime() - row.createdAt.getTime();
    if (ageMs < filter.pendingHours * 60 * 60 * 1000) return false;
  }
  return true;
}

export function resolveAudience(input: {
  rows: AudienceEnrollment[];
  audience: AudienceSpec;
  suppressed: Set<string>;
  marketing: boolean;
  now?: Date;
}): {
  recipients: AudienceEnrollment[];
  matched: number;
  excludedSuppressed: number;
  excludedOptOut: number;
} {
  const now = input.now ?? new Date();
  let matchedRows: AudienceEnrollment[];
  if (input.audience.kind === 'explicit') {
    const ids = new Set(input.audience.ids ?? []);
    const emails = new Set(
      (input.audience.emails ?? []).map((email) => email.toLowerCase()),
    );
    const references = new Set(input.audience.references ?? []);
    matchedRows = input.rows.filter(
      (row) =>
        ids.has(row.id) ||
        emails.has(row.email.toLowerCase()) ||
        (row.paystackReference && references.has(row.paystackReference)),
    );
  } else if (input.audience.kind === 'filter') {
    matchedRows = input.rows.filter((row) =>
      matchesFilter(
        row,
        input.audience.kind === 'filter' ? input.audience.filter : undefined,
        now,
      ),
    );
  } else if (input.audience.kind === 'all') {
    matchedRows = input.rows;
  } else {
    matchedRows = [];
  }

  let excludedSuppressed = 0;
  let excludedOptOut = 0;
  const recipients: AudienceEnrollment[] = [];
  const seen = new Set<string>();
  for (const row of matchedRows) {
    const email = row.email.toLowerCase();
    if (seen.has(email)) continue;
    if (input.suppressed.has(email)) {
      excludedSuppressed += 1;
      continue;
    }
    if (input.marketing && !row.marketingOptIn) {
      excludedOptOut += 1;
      continue;
    }
    seen.add(email);
    recipients.push(row);
  }
  return {
    recipients,
    matched: matchedRows.length,
    excludedSuppressed,
    excludedOptOut,
  };
}
