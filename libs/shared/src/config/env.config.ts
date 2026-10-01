import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4000'),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  /** Aurora marketing site (Enter First). Falls back to first FRONTEND_URL origin. */
  WEBSITE_URL: z.string().optional().default(''),
  DATABASE_URL: z
    .string()
    .default('postgres://aurora:aurora@localhost:5432/aurora_shop'),
  /**
   * Opt in to TypeORM synchronize. Ignored unless NODE_ENV=development and
   * DATABASE_URL is a local host. Staging and production always use migrations.
   */
  DB_SYNCHRONIZE: z.string().optional().default('false'),
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
  /**
   * Hops of reverse proxies to trust when reading X-Forwarded-For.
   * `false`/`0` ignores the header. `1` is typical behind one load balancer.
   */
  TRUST_PROXY: z.string().optional().default('false'),
  RATE_LIMIT_ENABLED: z.string().optional(),
  ENTER_FIRST_PUBLIC_RATE_LIMIT: z.coerce.number().default(20),
  /** Absolute origin used in email links such as unsubscribe. */
  PUBLIC_API_URL: z.string().optional().default(''),
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
  RESEND_WEBHOOK_SECRET: z.string().optional().default(''),
  UNSUBSCRIBE_TOKEN_SECRET: z.string().optional().default(''),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().default(5),
  EMAIL_BATCH_SIZE: z.coerce.number().default(100),

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

/** `false` ignores X-Forwarded-For. A number is how many proxy hops to trust. */
export type TrustProxy = false | number;

export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const value = (raw ?? 'false').trim().toLowerCase();
  if (
    !value ||
    value === 'false' ||
    value === '0' ||
    value === 'off' ||
    value === 'no'
  ) {
    return false;
  }
  if (value === 'true' || value === 'yes' || value === 'on') return 1;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) return false;
  return hops === 0 ? false : hops;
}

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
]);

/** True only for an explicit true/1/yes/on. Empty and "false" stay off. */
export function parseDbSynchronize(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return LOCAL_DATABASE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * Schema sync is off unless this process is local development and
 * DB_SYNCHRONIZE is explicitly enabled. A remote staging or production
 * database never synchronizes, even when NODE_ENV is development.
 */
export function shouldSynchronizeSchema(input: {
  nodeEnv: string;
  databaseUrl: string;
  dbSynchronize: string | undefined;
}): boolean {
  if (input.nodeEnv !== 'development') return false;
  if (!parseDbSynchronize(input.dbSynchronize)) return false;
  return isLocalDatabaseUrl(input.databaseUrl);
}

export function parseRateLimitEnabled(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

export function productionConfigErrors(env: RawEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const errors: string[] = [];
  if (env.JWT_SECRET_KEY.includes('change-me')) {
    errors.push('JWT_SECRET_KEY must be set in production');
  }
  if (env.PAYMENT_CREDENTIALS_ENC_KEY.includes('change-me')) {
    errors.push('PAYMENT_CREDENTIALS_ENC_KEY must be set in production');
  }
  if (!env.DOCS_PASSWORD || env.DOCS_PASSWORD === 'replace-me') {
    errors.push('DOCS_PASSWORD must be set in production');
  }
  if (!env.PAYSTACK_SECRET_KEY) {
    errors.push('PAYSTACK_SECRET_KEY must be set in production');
  }
  return errors;
}

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

  const productionErrors = productionConfigErrors(env);
  if (productionErrors.length) {
    throw new Error(productionErrors.join('; '));
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
    website: {
      url:
        env.WEBSITE_URL?.trim() ||
        env.FRONTEND_URL.split(',')
          .map((s) => s.trim())
          .filter(Boolean)[0] ||
        'http://localhost:3000',
    },
    database: {
      url: env.DATABASE_URL,
      synchronize: env.DB_SYNCHRONIZE,
    },
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
    http: {
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      rateLimitEnabled: parseRateLimitEnabled(env.RATE_LIMIT_ENABLED),
      publicRateLimit: Math.min(
        300,
        Math.max(1, env.ENTER_FIRST_PUBLIC_RATE_LIMIT),
      ),
      publicApiUrl: env.PUBLIC_API_URL?.replace(/\/$/, '') ?? '',
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
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
      maxAttempts: Math.min(10, Math.max(1, env.EMAIL_MAX_ATTEMPTS)),
      batchSize: Math.min(100, Math.max(1, env.EMAIL_BATCH_SIZE)),
    },
    unsubscribe: {
      secret: env.UNSUBSCRIBE_TOKEN_SECRET || env.JWT_SECRET_KEY,
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
