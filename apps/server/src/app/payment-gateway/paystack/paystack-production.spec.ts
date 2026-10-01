import { config } from '@app/shared/config/env.config';

describe('production Paystack key', () => {
  const keys = [
    'NODE_ENV',
    'JWT_SECRET_KEY',
    'PAYMENT_CREDENTIALS_ENC_KEY',
    'DOCS_PASSWORD',
    'PAYSTACK_SECRET_KEY',
  ] as const;
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) previous[key] = process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET_KEY = 'prod-jwt-secret';
    process.env.PAYMENT_CREDENTIALS_ENC_KEY = 'prod-payments-key';
    process.env.DOCS_PASSWORD = 'prod-docs-password';
  });

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it('refuses to boot production when PAYSTACK_SECRET_KEY is empty', () => {
    process.env.PAYSTACK_SECRET_KEY = '';
    expect(() => config()).toThrow(/PAYSTACK_SECRET_KEY/);
  });

  it('boots production when the key is set', () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_example';
    expect(config().paystack.secretKey).toBe('sk_live_example');
  });
});
