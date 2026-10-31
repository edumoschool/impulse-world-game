import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import 'reflect-metadata';

const rootEnv = new URL('../../../../.env', import.meta.url);
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

/** Points any database URL at the test database, so tests cannot touch development data. */
export function toTestDatabase(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/impulse_test';
  return parsed.toString();
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = toTestDatabase(process.env.DATABASE_URL ?? '');
process.env.SYSTEM_DATABASE_URL = toTestDatabase(process.env.SYSTEM_DATABASE_URL ?? '');
process.env.MIGRATION_DATABASE_URL = toTestDatabase(process.env.MIGRATION_DATABASE_URL ?? '');
process.env.REDIS_URL = (process.env.REDIS_URL ?? '').replace(/\/\d+$/, '/1');
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.RATE_LIMIT_MULTIPLIER = '1000';
process.env.REFRESH_REUSE_GRACE_SECONDS = '0';

// Allows CI to run without a generated .env.
process.env.AUTH_JWT_SECRET ||= randomBytes(48).toString('base64url');
process.env.AUTH_CSRF_SECRET ||= randomBytes(48).toString('base64url');
process.env.AUTH_ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
process.env.METRICS_TOKEN ||= randomBytes(32).toString('base64url');
