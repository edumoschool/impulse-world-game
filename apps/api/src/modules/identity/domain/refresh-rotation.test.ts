import { describe, expect, it } from 'vitest';
import { decideRotation } from './refresh-rotation.js';

const now = new Date('2026-10-31T12:00:00Z');
const later = new Date('2026-11-30T12:00:00Z');
const liveSession = { expiresAt: later, revokedAt: null };
const liveToken = { expiresAt: later, consumedAt: null };
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('decideRotation', () => {
  it('rotates a live token', () => {
    expect(decideRotation(liveToken, liveSession, now, 10)).toEqual({ action: 'rotate' });
  });

  it('refuses without revoking a replay inside the grace window', () => {
    const token = { ...liveToken, consumedAt: secondsAgo(3) };
    expect(decideRotation(token, liveSession, now, 10)).toEqual({ action: 'reject-concurrent' });
  });

  it('revokes the session on a replay after the grace window', () => {
    const token = { ...liveToken, consumedAt: secondsAgo(11) };
    expect(decideRotation(token, liveSession, now, 10)).toEqual({ action: 'revoke-session' });
  });

  it('treats any replay as theft when the grace window is zero', () => {
    const token = { ...liveToken, consumedAt: secondsAgo(1) };
    expect(decideRotation(token, liveSession, now, 0)).toEqual({ action: 'revoke-session' });
  });

  it('rejects an expired token', () => {
    const token = { ...liveToken, expiresAt: secondsAgo(1) };
    expect(decideRotation(token, liveSession, now, 10)).toEqual({
      action: 'reject',
      reason: 'expired',
    });
  });

  it('rejects a token from an expired session', () => {
    const session = { ...liveSession, expiresAt: secondsAgo(1) };
    expect(decideRotation(liveToken, session, now, 10)).toEqual({
      action: 'reject',
      reason: 'expired',
    });
  });

  it('checks revocation first, so a revoked session never rotates', () => {
    const session = { ...liveSession, revokedAt: secondsAgo(100) };
    const token = { ...liveToken, consumedAt: secondsAgo(1) };
    expect(decideRotation(token, session, now, 10)).toEqual({
      action: 'reject',
      reason: 'revoked',
    });
  });
});
