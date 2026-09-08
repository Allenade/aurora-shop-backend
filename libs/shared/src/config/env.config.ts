import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4000'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .default('postgres://aurora:aurora@localhost:5432/aurora_shop'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET_KEY: z.string().default('aurora-dev-jwt-secret-change-me'),
  JWT_SALT_ROUNDS: z.coerce.number().default(10),
  JWT_ACCESS_TOKEN_EXPIRATION_MS: z.coerce.number().default(900_000),
  JWT_REFRESH_TOKEN_EXPIRATION_MS: z.coerce.number().default(604_800_000),
  JWT_REFRESH_TOKEN_REMEMBER_MS: z.coerce.number().default(2_592_000_000),

  OTP_EXPIRY_MINUTES: z.coerce.number().default(15),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(10),

  DOCS_USERNAME: z.string().default('docs'),
  DOCS_PASSWORD: z.string().default('replace-me'),

  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_PUBLIC_KEY: z.string().optional().default(''),
  PAYMENT_CREDENTIALS_ENC_KEY: z
    .string()
    .default('dev-insecure-payments-encryption-key-change-me'),

  BANK_NAME: z.string().default('Guaranty Trust Bank (GTB)'),
  BANK_ACCOUNT_NAME: z.string().default('Aurora Stores Ltd'),
  BANK_ACCOUNT_NUMBER: z.string().default('0123456789'),

  VAT_RATE: z.coerce.number().default(0.075),
  DELIVERY_STANDARD_PRICE: z.coerce.number().default(2500),
  DELIVERY_EXPRESS_PRICE: z.coerce.number().default(5500),
  UNPAID_ORDER_CANCEL_HOURS: z.coerce.number().default(24),

  RESEND_API_KEY: z.string().optional().default(''),
  RESEND_FROM_EMAIL: z.string().default('no-reply@aurora.local'),
  RESEND_FROM_NAME: z.string().default('Aurora Stores'),

  CLOUDFLARE_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET_NAME: z.string().default('aurorashop090'),
  R2_PUBLIC_BASE_URL: z
    .string()
    .default('https://pub-80fb763d2cac40069bedc39977ed512c.r2.dev'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  LOG_REQUESTS: z.coerce.boolean().default(true),

  SEED_ADMIN_EMAIL: z.string().default('admin@regaliaelectrical.ng'),
  SEED_BUYER_EMAIL: z.string().default('bayonuga@example.com'),
  SEED_PASSWORD: z.string().default('Aurora!2026'),
});

export type RawEnv = z.infer<typeof envSchema>;

export function validateConfig() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Config validation error: ${errorMessage}`);
  }
}

export type EnvTypes = ReturnType<typeof config>;

export function config() {
  const env = validateConfig();

  if (env.NODE_ENV === 'production') {
    if (env.JWT_SECRET_KEY.includes('change-me')) {
      throw new Error('JWT_SECRET_KEY must be set in production');
    }
    if (env.PAYMENT_CREDENTIALS_ENC_KEY.includes('change-me')) {
      throw new Error('PAYMENT_CREDENTIALS_ENC_KEY must be set in production');
    }
    if (!env.DOCS_PASSWORD || env.DOCS_PASSWORD === 'replace-me') {
      throw new Error('DOCS_PASSWORD must be set in production');
    }
  }

  return {
    port: Number(env.PORT),
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    frontend: {
      allowedOrigins: env.FRONTEND_URL.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    auth: {
      jwtSecret: env.JWT_SECRET_KEY,
      saltRounds: env.JWT_SALT_ROUNDS,
      jwtExpiresIn: env.JWT_ACCESS_TOKEN_EXPIRATION_MS,
      jwtRefreshExpiresIn: env.JWT_REFRESH_TOKEN_EXPIRATION_MS,
      jwtRefreshRememberExpiresIn: env.JWT_REFRESH_TOKEN_REMEMBER_MS,
    },
    otp: {
      expiryMinutes: env.OTP_EXPIRY_MINUTES,
      resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
    },
    docs: {
      username: env.DOCS_USERNAME,
      password: env.DOCS_PASSWORD,
    },
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY,
      publicKey: env.PAYSTACK_PUBLIC_KEY,
    },
    payments: {
      credentialsEncKey: env.PAYMENT_CREDENTIALS_ENC_KEY,
    },
    bank: {
      name: env.BANK_NAME,
      accountName: env.BANK_ACCOUNT_NAME,
      accountNumber: env.BANK_ACCOUNT_NUMBER,
    },
    commerce: {
      vatRate: env.VAT_RATE,
      deliveryStandard: env.DELIVERY_STANDARD_PRICE,
      deliveryExpress: env.DELIVERY_EXPRESS_PRICE,
      unpaidCancelHours: env.UNPAID_ORDER_CANCEL_HOURS,
    },
    email: {
      apiKey: env.RESEND_API_KEY,
      fromEmail: env.RESEND_FROM_EMAIL,
      fromName: env.RESEND_FROM_NAME,
    },
    logging: {
      level: env.LOG_LEVEL,
      requestLoggerEnabled: env.LOG_REQUESTS,
    },
    storage: {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET_NAME,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    },
    seed: {
      adminEmail: env.SEED_ADMIN_EMAIL,
      buyerEmail: env.SEED_BUYER_EMAIL,
      password: env.SEED_PASSWORD,
    },
  };
}
