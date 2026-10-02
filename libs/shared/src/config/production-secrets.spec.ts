import { productionConfigErrors, type RawEnv } from './env.config';

function env(overrides: Partial<RawEnv> = {}): RawEnv {
  return {
    PORT: '4000',
    HOST: '0.0.0.0',
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://shop.example',
    WEBSITE_URL: 'https://aurora.example',
    DATABASE_URL: 'postgres://localhost/db',
    DB_SYNCHRONIZE: 'false',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET_KEY: 'real-jwt-secret',
    JWT_SALT_ROUNDS: 10,
    JWT_ACCESS_TOKEN_EXPIRATION_MS: 1,
    JWT_REFRESH_TOKEN_EXPIRATION_MS: 1,
    JWT_REFRESH_TOKEN_REMEMBER_MS: 1,
    OTP_EXPIRY_MINUTES: 15,
    OTP_RESEND_COOLDOWN_SECONDS: 30,
    OTP_MAX_ATTEMPTS: 10,
    DOCS_USERNAME: 'docs',
    DOCS_PASSWORD: 'real-docs-password',
    PAYSTACK_SECRET_KEY: '',
    PAYSTACK_PUBLIC_KEY: '',
    TRUST_PROXY: 'false',
    RATE_LIMIT_ENABLED: undefined,
    ENTER_FIRST_PUBLIC_RATE_LIMIT: 20,
    PUBLIC_API_URL: '',
    PAYMENT_CREDENTIALS_ENC_KEY: 'real-payments-key',
    BANK_NAME: 'GTB',
    BANK_ACCOUNT_NAME: 'Aurora',
    BANK_ACCOUNT_NUMBER: '0',
    VAT_RATE: 0.075,
    DELIVERY_STANDARD_PRICE: 1,
    DELIVERY_EXPRESS_PRICE: 1,
    UNPAID_ORDER_CANCEL_HOURS: 24,
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: 'no-reply@aurora.local',
    RESEND_FROM_NAME: 'Aurora',
    RESEND_WEBHOOK_SECRET: '',
    UNSUBSCRIBE_TOKEN_SECRET: '',
    EMAIL_MAX_ATTEMPTS: 5,
    EMAIL_BATCH_SIZE: 100,
    CLOUDFLARE_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: 'bucket',
    R2_PUBLIC_BASE_URL: 'https://example.com',
    LOG_LEVEL: 'info',
    LOG_REQUESTS: true,
    SEED_ADMIN_EMAIL: '',
    SEED_ADMIN_PASSWORD: '',
    ...overrides,
  };
}

describe('production Paystack key', () => {
  it('fails production startup when the secret is empty', () => {
    expect(productionConfigErrors(env())).toContain(
      'PAYSTACK_SECRET_KEY must be set in production',
    );
  });

  it('allows an empty secret outside production so mock mode can run', () => {
    expect(
      productionConfigErrors(
        env({ NODE_ENV: 'development', PAYSTACK_SECRET_KEY: '' }),
      ),
    ).toEqual([]);
  });

  it('passes production when the secret is set', () => {
    expect(
      productionConfigErrors(env({ PAYSTACK_SECRET_KEY: 'sk_live_example' })),
    ).toEqual([]);
  });
});
