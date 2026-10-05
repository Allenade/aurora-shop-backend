import { CORE_30_PROGRAM } from '../program/core30';
import { completedAge, dateOnly } from './age';
import { maskEmail, maskName, maskPhone } from './pii';

export type EnrollmentCsvRow = {
  id: string;
  createdAt?: Date | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  program?: string | null;
  tracks: string[];
  amount: number;
  currency: string;
  paymentStatus: string;
  paystackReference?: string | null;
  paidAt?: Date | null;
  consentAt?: Date | null;
  marketingOptIn: boolean;
  isMinor?: boolean | null;
  amountMismatch: boolean;
  emailSentAt?: Date | null;
  dateOfBirth?: string | Date | null;
  ageConfirmed?: boolean | null;
  guardianName?: string | null;
  guardianEmail?: string | null;
};

const HEADER = [
  'id',
  'createdAt',
  'firstName',
  'lastName',
  'email',
  'phone',
  'program',
  'tracks',
  'amount',
  'currency',
  'paymentStatus',
  'reference',
  'paidAt',
  'consentAt',
  'marketingOptIn',
  'isMinor',
  'amountMismatch',
  'emailSentAt',
  'dateOfBirth',
  'age',
  'ageConfirmed',
  'guardianName',
  'guardianEmail',
];

export function enrollmentsToCsv(
  rows: EnrollmentCsvRow[],
  maskPii = false,
  now = new Date(),
) {
  const lines = [HEADER.join(',')];
  for (const row of rows) {
    const dob = maskPii ? null : dateOnly(row.dateOfBirth);
    lines.push(
      [
        row.id,
        iso(row.createdAt),
        csv(maskPii ? maskName(row.firstName) : row.firstName),
        csv(maskPii ? maskName(row.lastName) : row.lastName),
        csv(maskPii ? maskEmail(row.email) : row.email),
        csv(maskPii ? maskPhone(row.phone) : row.phone),
        csv(row.program?.trim() || CORE_30_PROGRAM),
        csv(row.tracks.join('|')),
        row.amount,
        row.currency,
        row.paymentStatus,
        csv(row.paystackReference),
        iso(row.paidAt),
        iso(row.consentAt),
        row.marketingOptIn ? 'true' : 'false',
        row.isMinor == null ? '' : String(row.isMinor),
        row.amountMismatch ? 'true' : 'false',
        iso(row.emailSentAt),
        csv(dob),
        maskPii ? '' : ageCell(dob, now),
        row.ageConfirmed == null ? '' : String(row.ageConfirmed),
        csv(maskPii ? maskName(row.guardianName) : row.guardianName),
        csv(maskPii ? maskEmail(row.guardianEmail) : row.guardianEmail),
      ].join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function ageCell(dob: string | null, now: Date) {
  const age = completedAge(dob, now);
  return age == null ? '' : String(age);
}

function iso(value?: Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function csv(value?: string | null) {
  const text = value ?? '';
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
