export const ENTER_FIRST_RATE_LIMITS = {
  enrollPerMinute: 8,
  statusPerMinute: 30,
  coursesPerMinute: 60,
} as const;

export type ComplianceCheck = {
  id: string;
  pass: boolean;
  findings: number;
  detail: string;
};

export function evaluateComplianceChecks(input: {
  paystackKeySet: boolean;
  webhookUsesRawBody: boolean;
  missingConsent: number;
  termsUrl: string;
  privacyUrl: string;
  rateLimitEnabled: boolean;
}): ComplianceCheck[] {
  const missingPolicy =
    (input.termsUrl.trim() ? 0 : 1) + (input.privacyUrl.trim() ? 0 : 1);
  return [
    {
      id: 'webhook_signature_raw_body',
      pass: input.webhookUsesRawBody,
      findings: input.webhookUsesRawBody ? 0 : 1,
      detail: 'Paystack webhook HMAC-SHA512 is computed over the raw body',
    },
    {
      id: 'paystack_key_set',
      pass: input.paystackKeySet,
      findings: input.paystackKeySet ? 0 : 1,
      detail: 'PAYSTACK_SECRET_KEY is configured',
    },
    {
      id: 'consent_captured',
      pass: input.missingConsent === 0,
      findings: input.missingConsent,
      detail: 'Paid or pending enrollments in range without consentAt',
    },
    {
      id: 'policy_pages_configured',
      pass: missingPolicy === 0,
      findings: missingPolicy,
      detail: 'Terms and privacy URLs are set in core settings',
    },
    {
      id: 'rate_limiting_on',
      pass:
        input.rateLimitEnabled && ENTER_FIRST_RATE_LIMITS.enrollPerMinute > 0,
      findings: input.rateLimitEnabled ? 0 : 1,
      detail: `Public enroll is limited to ${ENTER_FIRST_RATE_LIMITS.enrollPerMinute}/minute per client IP`,
    },
  ];
}
