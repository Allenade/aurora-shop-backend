import { escapeHtml } from './email-render';

export const CONFIRMATION_EMAIL_ATTEMPTS = 3;

/**
 * Rows updated by the claim. Mirrors the UPDATE ... WHERE used before send.
 * email_sent_at must be null so a replay does not mail people who already
 * received the previous confirmation.
 */
export const CONFIRMATION_CLAIM_WHERE =
  "payment_status = 'success' AND deleted_at IS NULL AND email_sent_at IS NULL AND (confirmation_email_status IS NULL OR confirmation_email_status = 'pending')";

export type ConfirmationClaimRow = {
  id: string;
  paymentStatus: string;
  confirmationEmailStatus?: string | null;
  emailSentAt?: Date | string | null;
  claimedAt?: Date | null;
};

export type ConfirmationJobData = {
  paymentRef: string;
  idempotencyKey: string;
  enrollmentIds: string[];
};

export function enrollmentConfirmationIdempotencyKey(
  paymentRef: string,
  resendToken?: string,
): string {
  const base = `ef-confirm-${paymentRef}`.replace(/\s+/g, '');
  if (!resendToken) return base.slice(0, 250);
  return `${base}-${resendToken}`.slice(0, 250);
}

export function isClaimableConfirmation(row: ConfirmationClaimRow): boolean {
  if (row.paymentStatus !== 'success') return false;
  if (row.emailSentAt) return false;
  const status = row.confirmationEmailStatus ?? null;
  return status == null || status === 'pending';
}

/**
 * In-memory stand-in for
 * UPDATE ... SET confirmation_email_status='sending', claimed_at=now()
 * WHERE id IN (...) AND <CONFIRMATION_CLAIM_WHERE> RETURNING.
 * A second call returns no rows.
 */
export function claimConfirmationOnce(
  rows: ConfirmationClaimRow[],
  ids: string[],
  now = new Date(),
): ConfirmationClaimRow[] {
  const wanted = new Set(ids);
  const claimed: ConfirmationClaimRow[] = [];
  for (const row of rows) {
    if (!wanted.has(row.id) || !isClaimableConfirmation(row)) continue;
    row.confirmationEmailStatus = 'sending';
    row.claimedAt = now;
    claimed.push({
      id: row.id,
      paymentStatus: row.paymentStatus,
      confirmationEmailStatus: row.confirmationEmailStatus,
      emailSentAt: row.emailSentAt ?? null,
      claimedAt: now,
    });
  }
  return claimed;
}

export function readConfirmationJob(data: unknown): ConfirmationJobData | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (typeof record.paymentRef !== 'string' || !record.paymentRef.trim()) {
    return null;
  }
  if (typeof record.idempotencyKey !== 'string' || !record.idempotencyKey) {
    return null;
  }
  if (!Array.isArray(record.enrollmentIds)) return null;
  const enrollmentIds = record.enrollmentIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (!enrollmentIds.length) return null;
  return {
    paymentRef: record.paymentRef,
    idempotencyKey: record.idempotencyKey,
    enrollmentIds,
  };
}

export function renderEnrollmentConfirmation(input: {
  studentName: string;
  courses: Array<{ title: string; messageHtml: string | null }>;
}): { subject: string; html: string; text: string } {
  const name = input.studentName.trim() || 'there';
  const courses = input.courses.length
    ? input.courses
    : [{ title: 'Your course', messageHtml: null }];
  const blocks = courses
    .map((course) => {
      const title = escapeHtml(course.title.trim() || 'Course');
      const message = course.messageHtml?.trim()
        ? course.messageHtml
        : '<p>We will send joining details shortly.</p>';
      return `<h2 style="font-size:18px;margin:24px 0 8px">${title}</h2><div>${message}</div>`;
    })
    .join('');
  const html = `<div style="font-family:Georgia,serif;color:#1c1917;line-height:1.5;max-width:560px">
<p style="letter-spacing:0.14em;font-size:12px;margin:0 0 16px">AURORA</p>
<h1 style="font-size:28px;font-weight:600;margin:0 0 12px">You're enrolled</h1>
<p>Hi ${escapeHtml(name)},</p>
<p>Your payment is confirmed. Here is how to join each course:</p>
${blocks}
<p style="margin-top:28px">— Aurora</p>
</div>`;
  const textCourses = courses
    .map((course) => {
      const title = course.title.trim() || 'Course';
      const plain = htmlToText(course.messageHtml ?? '');
      return plain ? `${title}\n${plain}` : title;
    })
    .join('\n\n');
  const text = `Aurora\n\nYou're enrolled\n\nHi ${name},\n\nYour payment is confirmed. Here is how to join each course:\n\n${textCourses}\n\n— Aurora`;
  return { subject: "You're enrolled", html, text };
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
