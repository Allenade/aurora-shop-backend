import {
  CONFIRMATION_CLAIM_WHERE,
  CONFIRMATION_EMAIL_ATTEMPTS,
  claimConfirmationOnce,
  enrollmentConfirmationIdempotencyKey,
  isClaimableConfirmation,
  renderEnrollmentConfirmation,
  type ConfirmationClaimRow,
} from './enrollment-confirmation';

function row(
  partial: Partial<ConfirmationClaimRow> & Pick<ConfirmationClaimRow, 'id'>,
): ConfirmationClaimRow {
  return {
    paymentStatus: 'success',
    confirmationEmailStatus: null,
    emailSentAt: null,
    ...partial,
  };
}

describe('enrollment confirmation claim', () => {
  it('claims null and pending successes once', () => {
    const rows = [
      row({ id: 'paid-new' }),
      row({ id: 'paid-pending', confirmationEmailStatus: 'pending' }),
      row({ id: 'already-sending', confirmationEmailStatus: 'sending' }),
      row({ id: 'already-sent', confirmationEmailStatus: 'sent' }),
      row({ id: 'failed-mail', confirmationEmailStatus: 'failed' }),
      row({
        id: 'legacy-sent',
        emailSentAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      row({ id: 'not-paid', paymentStatus: 'failed' }),
      row({ id: 'cancelled', paymentStatus: 'pending' }),
    ];

    const first = claimConfirmationOnce(
      rows,
      rows.map((item) => item.id),
    );
    expect(first.map((item) => item.id)).toEqual(['paid-new', 'paid-pending']);
    expect(
      first.every((item) => item.confirmationEmailStatus === 'sending'),
    ).toBe(true);
    expect(first.every((item) => item.claimedAt instanceof Date)).toBe(true);

    const second = claimConfirmationOnce(
      rows,
      rows.map((item) => item.id),
    );
    expect(second).toEqual([]);
    expect(isClaimableConfirmation(rows[0])).toBe(false);
  });

  it('does not claim a payment that is not Paystack-success', () => {
    const rows = [
      row({ id: 'failed', paymentStatus: 'failed' }),
      row({ id: 'pending', paymentStatus: 'pending' }),
      row({ id: 'refunded', paymentStatus: 'refunded' }),
    ];
    expect(
      claimConfirmationOnce(rows, ['failed', 'pending', 'refunded']),
    ).toEqual([]);
  });

  it('uses an ef-confirm idempotency key and a distinct resend key', () => {
    expect(enrollmentConfirmationIdempotencyKey('EF-1')).toBe(
      'ef-confirm-EF-1',
    );
    expect(enrollmentConfirmationIdempotencyKey('EF-1', 'resend-9')).toBe(
      'ef-confirm-EF-1-resend-9',
    );
    expect(CONFIRMATION_EMAIL_ATTEMPTS).toBe(3);
    expect(CONFIRMATION_CLAIM_WHERE).toContain(
      "confirmation_email_status IS NULL OR confirmation_email_status = 'pending'",
    );
    expect(CONFIRMATION_CLAIM_WHERE).toContain('email_sent_at IS NULL');
    expect(CONFIRMATION_CLAIM_WHERE).toContain("payment_status = 'success'");
  });

  it('renders one branded email listing every course message', () => {
    const rendered = renderEnrollmentConfirmation({
      studentName: 'Ada <script>',
      courses: [
        {
          title: 'Internet of Things',
          messageHtml:
            '<p>Join WhatsApp <a href="https://chat.whatsapp.com/abc">here</a></p>',
        },
        {
          title: 'Robotics',
          messageHtml: '<p>Meet: https://meet.google.com/xyz</p>',
        },
      ],
    });
    expect(rendered.subject).toBe("You're enrolled");
    expect(rendered.html).toContain('AURORA');
    expect(rendered.html).toContain("You're enrolled");
    expect(rendered.html).toContain('Hi Ada &lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('Internet of Things');
    expect(rendered.html).toContain('https://chat.whatsapp.com/abc');
    expect(rendered.html).toContain('Robotics');
    expect(rendered.html).toContain('https://meet.google.com/xyz');
    expect(rendered.text).toContain('Ada <script>');
    expect(rendered.text).toContain('Internet of Things');
  });
});
