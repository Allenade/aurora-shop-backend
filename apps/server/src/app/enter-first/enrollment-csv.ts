import { CORE_30_PROGRAM } from '../program/core30';
import { maskEmail, maskName, maskPhone } from './pii';

export type EnrollmentCsvSource = {
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
];

export function enrollmentsToCsv(rows: EnrollmentCsvSource[], maskPii = false) {
  const lines = [HEADER.join(',')];
  for (const row of rows) {
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
      ].join(','),
    );
  }
  return lines.join('\n');
}

function iso(value?: Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function csv(value?: string | null) {
  const text = value ?? '';
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
