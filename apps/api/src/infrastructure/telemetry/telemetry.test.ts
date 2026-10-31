import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { tenantCacheKey } from '../cache/tenant-cache.js';
import { tenantObjectKey } from '../storage/object-storage.js';
import { REDACTED_PATHS, resolveRequestId } from './logging.js';
import { SENTRY_DATA_COLLECTION } from './sentry-options.js';

function capture(entry: Record<string, unknown>): string {
  let output = '';
  const sink = new Writable({
    write(chunk, _encoding, done) {
      output += String(chunk);
      done();
    },
  });
  pino({ redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, sink).info(entry, 'event');
  return output;
}

describe('log redaction', () => {
  it.each([
    ['password', 'hunter2-secret'],
    ['passcode', 'sunny-otter'],
    ['refreshToken', 'raw-refresh-token'],
    ['email', 'parent@example.test'],
    ['username', 'little-explorer'],
    ['displayName', 'A Real Child Name'],
  ])('removes %s at the top level and one level down', (field, value) => {
    expect(capture({ [field]: value })).not.toContain(value);
    expect(capture({ body: { [field]: value } })).not.toContain(value);
  });

  it('removes auth headers and cookies', () => {
    const output = capture({
      req: { headers: { authorization: 'Bearer abc', cookie: 'iw_at=def' } },
      res: { headers: { 'set-cookie': 'iw_rt=ghi' } },
    });
    for (const secret of ['Bearer abc', 'iw_at=def', 'iw_rt=ghi']) {
      expect(output).not.toContain(secret);
    }
  });

  it('keeps non-sensitive fields', () => {
    expect(capture({ route: '/children' })).toContain('/children');
  });
});

describe('resolveRequestId', () => {
  it('keeps a well-formed inbound id, for tracing across services', () => {
    expect(resolveRequestId('abc-12345678')).toBe('abc-12345678');
  });

  it.each(['short', 'line\nbreak-forged-log-entry', 'x'.repeat(100), undefined, ['a', 'b']])(
    'replaces %j rather than trusting it',
    (header) => {
      expect(resolveRequestId(header)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});

describe('Sentry data collection', () => {
  it('sends nothing that could identify a child or carry a credential', () => {
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
  });
});

describe('tenant-scoped keys', () => {
  const tenantId = '0194f7a0-7c3e-7b1a-8a2e-111111111111';

  it('puts the tenant in cache keys and refuses to build one without it', () => {
    expect(tenantCacheKey(tenantId, 'progress', 'x')).toBe(`tenant:${tenantId}:progress:x`);
    expect(() => tenantCacheKey('', 'progress')).toThrow();
  });

  it('puts the tenant in object keys and refuses to build one without it', () => {
    expect(tenantObjectKey(tenantId, 'media', 'a.png')).toBe(`tenants/${tenantId}/media/a.png`);
    expect(() => tenantObjectKey('', 'media')).toThrow();
  });

  it.each(['../other-tenant', '..', 'a/b', 'a\\b', '.hidden', ''])(
    'refuses the path segment %j, so a key cannot escape its tenant prefix',
    (segment) => {
      expect(() => tenantObjectKey(tenantId, segment)).toThrow();
    },
  );
});
