"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.config = config;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('4000'),
    HOST: zod_1.z.string().default('0.0.0.0'),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    FRONTEND_URL: zod_1.z.string().default('http://localhost:3000'),
    DATABASE_URL: zod_1.z.string().default('postgres://aurora:aurora@localhost:5432/aurora_shop'),
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    JWT_SECRET_KEY: zod_1.z.string().default('aurora-dev-jwt-secret-change-me'),
    JWT_SALT_ROUNDS: zod_1.z.coerce.number().default(10),
    JWT_ACCESS_TOKEN_EXPIRATION_MS: zod_1.z.coerce.number().default(900_000),
    JWT_REFRESH_TOKEN_EXPIRATION_MS: zod_1.z.coerce.number().default(604_800_000),
    JWT_REFRESH_TOKEN_REMEMBER_MS: zod_1.z.coerce.number().default(2_592_000_000),
    OTP_EXPIRY_MINUTES: zod_1.z.coerce.number().default(15),
    OTP_RESEND_COOLDOWN_SECONDS: zod_1.z.coerce.number().default(30),
    OTP_MAX_ATTEMPTS: zod_1.z.coerce.number().default(10),
    DOCS_USERNAME: zod_1.z.string().default('docs'),
    DOCS_PASSWORD: zod_1.z.string().default('replace-me'),
    PAYSTACK_SECRET_KEY: zod_1.z.string().optional().default(''),
    PAYSTACK_PUBLIC_KEY: zod_1.z.string().optional().default(''),
    PAYMENT_CREDENTIALS_ENC_KEY: zod_1.z
        .string()
        .default('dev-insecure-payments-encryption-key-change-me'),
    BANK_NAME: zod_1.z.string().default('Guaranty Trust Bank (GTB)'),
    BANK_ACCOUNT_NAME: zod_1.z.string().default('Aurora Stores Ltd'),
    BANK_ACCOUNT_NUMBER: zod_1.z.string().default('0123456789'),
    VAT_RATE: zod_1.z.coerce.number().default(0.075),
    DELIVERY_STANDARD_PRICE: zod_1.z.coerce.number().default(2500),
    DELIVERY_EXPRESS_PRICE: zod_1.z.coerce.number().default(5500),
    UNPAID_ORDER_CANCEL_HOURS: zod_1.z.coerce.number().default(24),
    RESEND_API_KEY: zod_1.z.string().optional().default(''),
    RESEND_FROM_EMAIL: zod_1.z.string().default('no-reply@aurora.local'),
    RESEND_FROM_NAME: zod_1.z.string().default('Aurora Stores'),
    SEED_ADMIN_EMAIL: zod_1.z.string().default('admin@regaliaelectrical.ng'),
    SEED_BUYER_EMAIL: zod_1.z.string().default('bayonuga@example.com'),
    SEED_PASSWORD: zod_1.z.string().default('Aurora!2026'),
});
function validateConfig() {
    try {
        return envSchema.parse(process.env);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Config validation error: ${errorMessage}`);
    }
}
function config() {
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
        seed: {
            adminEmail: env.SEED_ADMIN_EMAIL,
            buyerEmail: env.SEED_BUYER_EMAIL,
            password: env.SEED_PASSWORD,
        },
    };
}
//# sourceMappingURL=env.config.js.map