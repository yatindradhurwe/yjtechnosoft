import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  /** Public URL of the web app, e.g. https://app.example.com */
  APP_URL: z.string().url().default('http://localhost:5174'),
  /** Public URL of this API (used for webhooks, signed file links) */
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5174'),
  /** Root domain for tenant subdomains, e.g. "example.com" → creator.example.com */
  PLATFORM_DOMAIN: z.string().optional(),
  BRAND_NAME: z.string().default('YJ Creator Studio'),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  /** Secret for signing short-lived media URLs */
  MEDIA_SIGNING_SECRET: z.string().min(16).default('dev-media-secret-change-me-please'),
  /** 32-byte key, base64. Encrypts provider credentials stored in the database. */
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(200),

  // Payments (env values are used when no platform integration is stored in the DB)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool,
  EMAIL_FROM: z.string().default('Creator Studio <no-reply@localhost>'),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'none']).default('none'),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Bootstrap super admin (created by the seed script)
  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),

  LOG_LEVEL: z.string().default('info'),
  DISABLE_WORKER: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd) {
  const weak = ['JWT_ACCESS_SECRET', 'MEDIA_SIGNING_SECRET'] as const;
  for (const key of weak) {
    if (env[key].startsWith('dev-')) throw new Error(`${key} must be set to a strong random value in production`);
  }
  if (!env.INTEGRATION_ENCRYPTION_KEY) throw new Error('INTEGRATION_ENCRYPTION_KEY is required in production');
}
