import { existsSync } from 'node:fs';
import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.url(),
    SYSTEM_DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),

    REDIS_URL: z.url(),
    RATE_LIMIT_MULTIPLIER: z.coerce.number().positive().default(1),

    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_FROM: z.string().min(1),

    AUTH_JWT_SECRET: secret,
    AUTH_CSRF_SECRET: secret,
    AUTH_ENCRYPTION_KEY: z.base64().refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'must be 32 bytes encoded as base64',
    }),
    METRICS_TOKEN: secret,

    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
    REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),

    SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.url().optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_JWT_SECRET === env.AUTH_CSRF_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_CSRF_SECRET'],
        message: 'must differ from AUTH_JWT_SECRET',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const name of ['DATABASE_URL', 'SYSTEM_DATABASE_URL'] as const) {
        if (new URL(env[name]).password.endsWith('_dev_only')) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'uses a development password' });
        }
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

/** Injection token. Configuration is plain data, loaded once at startup. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Reads the repository's .env when present. Real environment variables take precedence. */
export function loadRootEnvFile(): void {
  const rootEnv = new URL('../../../../.env', import.meta.url);
  if (existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
}

/** Throws a message naming only the invalid variables, never their values. */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration. ${problems}`);
  }
  return result.data;
}
