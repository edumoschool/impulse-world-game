import { describe, expect, it } from 'vitest';
import { csrfTokenFor, generateOpaqueToken, hashToken, isValidCsrfToken } from './tokens.js';

const secret = 'test-secret-with-enough-length-for-hmac';

describe('opaque tokens', () => {
  it('generates distinct tokens of at least 256 bits', () => {
    const first = generateOpaqueToken();
    expect(first).not.toEqual(generateOpaqueToken());
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
  });

  it('never stores a hash equal to the raw token', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).not.toEqual(token);
    expect(hashToken(token)).toEqual(hashToken(token));
  });
});

describe('CSRF tokens', () => {
  it('accepts the token issued for a session', () => {
    expect(isValidCsrfToken('session-a', secret, csrfTokenFor('session-a', secret))).toBe(true);
  });

  it('rejects a token issued for another session', () => {
    expect(isValidCsrfToken('session-a', secret, csrfTokenFor('session-b', secret))).toBe(false);
  });

  it('rejects a token made with another secret', () => {
    const forged = csrfTokenFor('session-a', 'another-secret-of-sufficient-length');
    expect(isValidCsrfToken('session-a', secret, forged)).toBe(false);
  });

  it('rejects a value of the wrong length without throwing', () => {
    expect(isValidCsrfToken('session-a', secret, 'short')).toBe(false);
  });
});
