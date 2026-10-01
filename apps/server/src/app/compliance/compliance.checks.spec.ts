import { evaluateComplianceChecks } from './compliance.checks';
import { PAYSTACK_WEBHOOK_USES_RAW_BODY } from '../payment-gateway/paystack/paystack-signature';

describe('evaluateComplianceChecks', () => {
  it('fails closed when the Paystack key, consent, or policy pages are missing', () => {
    const checks = evaluateComplianceChecks({
      paystackKeySet: false,
      webhookUsesRawBody: PAYSTACK_WEBHOOK_USES_RAW_BODY,
      missingConsent: 4,
      termsUrl: '',
      privacyUrl: 'https://example.com/privacy',
      rateLimitEnabled: true,
    });
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId.webhook_signature_raw_body.pass).toBe(true);
    expect(byId.paystack_key_set.pass).toBe(false);
    expect(byId.consent_captured.findings).toBe(4);
    expect(byId.policy_pages_configured.findings).toBe(1);
    expect(byId.rate_limiting_on.pass).toBe(true);
  });
});
