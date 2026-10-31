export interface StoredRefreshToken {
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface StoredSession {
  expiresAt: Date;
  revokedAt: Date | null;
}

export type RotationDecision =
  | { action: 'rotate' }
  | { action: 'reject'; reason: 'expired' | 'revoked' }
  /** Two near-simultaneous refreshes from one client. Refused, but not treated as theft. */
  | { action: 'reject-concurrent' }
  /** A consumed token came back after the grace window. Assume it was stolen. */
  | { action: 'revoke-session' };

/** Decides what to do with a presented refresh token (ADR-005). */
export function decideRotation(
  token: StoredRefreshToken,
  session: StoredSession,
  now: Date,
  graceSeconds: number,
): RotationDecision {
  if (session.revokedAt) {
    return { action: 'reject', reason: 'revoked' };
  }
  if (token.consumedAt) {
    const age = now.getTime() - token.consumedAt.getTime();
    return age <= graceSeconds * 1000
      ? { action: 'reject-concurrent' }
      : { action: 'revoke-session' };
  }
  if (token.expiresAt <= now || session.expiresAt <= now) {
    return { action: 'reject', reason: 'expired' };
  }
  return { action: 'rotate' };
}
