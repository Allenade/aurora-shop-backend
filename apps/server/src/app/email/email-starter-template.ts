/**
 * One real transactional template. Placeholders only — no sample people.
 * Inserted when the slug is absent, including after a soft delete is skipped
 * so a removed template is not recreated.
 */
export const STARTER_EMAIL_TEMPLATE = {
  slug: 'enrollment-confirmation',
  name: 'Enrollment confirmation',
  subject: 'Your enrollment',
  html: [
    '<p>Hello {{firstName}} {{lastName}},</p>',
    '<p>This confirms the enrollment for {{track}}.</p>',
    '<p>Amount: {{amount}}</p>',
    '<p>Reference: {{reference}}</p>',
    '<p>Cutoff: {{cutoffDate}}</p>',
    '<p><a href="{{payLink}}">Open the payment page</a></p>',
  ].join(''),
  text: [
    'Hello {{firstName}} {{lastName}},',
    'This confirms the enrollment for {{track}}.',
    'Amount: {{amount}}',
    'Reference: {{reference}}',
    'Cutoff: {{cutoffDate}}',
    'Payment page: {{payLink}}',
  ].join('\n'),
  kind: 'transactional' as const,
};
