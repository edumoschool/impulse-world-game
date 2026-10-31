import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseConfig } from './app-config.js';

const valid = {
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://impulse_app:strong_password@db:5432/impulse',
  SYSTEM_DATABASE_URL: 'postgresql://impulse_system:strong_password@db:5432/impulse',
  REDIS_URL: 'redis://redis:6379/0',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  SMTP_HOST: 'mail',
  SMTP_PORT: '25',
  SMTP_FROM: 'noreply@example.test',
  AUTH_JWT_SECRET: 'j'.repeat(40),
  AUTH_CSRF_SECRET: 'c'.repeat(40),
  AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  METRICS_TOKEN: 'm'.repeat(40),
};

describe('parseConfig', () => {
  it('accepts a complete configuration', () => {
    expect(parseConfig(valid).API_PORT).toBe(4000);
  });

  it('refuses to start without a secret', () => {
    expect(() => parseConfig({ ...valid, AUTH_JWT_SECRET: undefined })).toThrow(/AUTH_JWT_SECRET/);
  });

  it('rejects a weak secret', () => {
    expect(() => parseConfig({ ...valid, AUTH_JWT_SECRET: 'short' })).toThrow(/AUTH_JWT_SECRET/);
  });

  it('rejects reuse of the signing secret for CSRF', () => {
    const shared = { ...valid, AUTH_CSRF_SECRET: valid.AUTH_JWT_SECRET };
    expect(() => parseConfig(shared)).toThrow(/AUTH_CSRF_SECRET/);
  });

  it('rejects an encryption key of the wrong length', () => {
    const key = randomBytes(16).toString('base64');
    expect(() => parseConfig({ ...valid, AUTH_ENCRYPTION_KEY: key })).toThrow(
      /AUTH_ENCRYPTION_KEY/,
    );
  });

  it('never includes secret values in its error message', () => {
    const secret = 'do-not-print-me';
    try {
      parseConfig({ ...valid, AUTH_JWT_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('refuses development passwords in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://impulse_app:app_dev_only@db:5432/impulse',
    };
    expect(() => parseConfig(production)).toThrow(/development password/);
  });
});
