import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of randomness for refresh, reset and invitation tokens. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 suits these tokens: unlike passwords they are long and random, so cannot be guessed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** CSRF token bound to one session, so it needs no server-side storage. */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('base64url');
}

export function isValidCsrfToken(sessionId: string, secret: string, received: string): boolean {
  const expected = Buffer.from(csrfTokenFor(sessionId, secret));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
