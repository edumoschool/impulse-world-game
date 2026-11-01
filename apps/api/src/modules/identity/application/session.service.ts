import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES, type SessionSummary, type UserKind } from '@impulse/contracts';
import { jwtVerify, SignJWT } from 'jose';
import { AppError } from '../../../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { MetricsRegistry } from '../../../infrastructure/telemetry/metrics.js';
import { AuditLog } from '../../audit/index.js';
import { decideRotation } from '../domain/refresh-rotation.js';
import { generateOpaqueToken, hashToken } from '../domain/tokens.js';

const ISSUER = 'impulse-world';
const AUDIENCE = 'impulse-api';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  kind: UserKind;
}

export interface IssuedTokens {
  sessionId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface NewSession {
  userId: string;
  kind: UserKind;
  tenantId: string | null;
  deviceLabel?: string | undefined;
  mfaVerified?: boolean;
}

/** Thrown out of a rolled-back transaction would lose the revocation, so it is returned instead. */
type RotationOutcome =
  | { ok: true; tokens: IssuedTokens }
  | { ok: false; error: AppError; revokeSessionId?: string; userId?: string };

@Injectable()
export class SessionService {
  private readonly signingKey: Uint8Array;

  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly metrics: MetricsRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.signingKey = new TextEncoder().encode(config.AUTH_JWT_SECRET);
  }

  /** Accepts a transaction, so registration can create the account and session atomically. */
  async issue(tx: Tx, session: NewSession): Promise<IssuedTokens> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000);
    const created = await tx.userSession.create({
      data: {
        userId: session.userId,
        activeTenantId: session.tenantId,
        deviceLabel: session.deviceLabel ?? null,
        mfaVerifiedAt: session.mfaVerified ? now : null,
        expiresAt,
      },
    });
    const refreshToken = generateOpaqueToken();
    await tx.refreshToken.create({
      data: { sessionId: created.id, tokenHash: hashToken(refreshToken), expiresAt },
    });
    const accessToken = await this.signAccessToken({
      userId: session.userId,
      sessionId: created.id,
      tenantId: session.tenantId,
      kind: session.kind,
    });
    return { sessionId: created.id, userId: session.userId, accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.signingKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      return {
        userId: payload.sub as string,
        sessionId: payload.sid as string,
        tenantId: (payload.tid as string | null) ?? null,
        kind: payload.kind as UserKind,
      };
    } catch {
      throw AppError.unauthenticated('Invalid or expired access token');
    }
  }

  /** Returns the session when it can still be used. Checked on every request. */
  async loadActive(sessionId: string) {
    const session = await this.database.global.userSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        activeTenantId: true,
        mfaVerifiedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppError(ERROR_CODES.SESSION_REVOKED, 401, 'Session is no longer valid');
    }
    return session;
  }

  /**
   * Single-use rotation. The compare-and-set on `consumedAt` means only one of two concurrent
   * requests for the same token can win.
   */
  async refresh(rawToken: string): Promise<IssuedTokens> {
    const tokenHash = hashToken(rawToken);
    const outcome = await this.database.global.$transaction(
      async (tx): Promise<RotationOutcome> => {
        const stored = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { session: { include: { user: { select: { kind: true, status: true } } } } },
        });
        if (!stored) {
          return { ok: false, error: AppError.unauthenticated('Invalid refresh token') };
        }

        const now = new Date();
        const decision = decideRotation(
          stored,
          stored.session,
          now,
          this.config.REFRESH_REUSE_GRACE_SECONDS,
        );
        switch (decision.action) {
          case 'reject':
            return {
              ok: false,
              error: AppError.unauthenticated('Refresh token is no longer valid'),
            };
          case 'reject-concurrent':
            return {
              ok: false,
              error: new AppError(ERROR_CODES.TOKEN_ALREADY_ROTATED, 401, 'Token already rotated'),
            };
          case 'revoke-session':
            return {
              ok: false,
              error: new AppError(ERROR_CODES.SESSION_REVOKED, 401, 'Session is no longer valid'),
              revokeSessionId: stored.sessionId,
              userId: stored.session.userId,
            };
          case 'rotate':
            break;
        }

        if (stored.session.user.status !== 'ACTIVE') {
          return { ok: false, error: AppError.unauthenticated('Account is not active') };
        }

        const claimed = await tx.refreshToken.updateMany({
          where: { id: stored.id, consumedAt: null },
          data: { consumedAt: now },
        });
        if (claimed.count === 0) {
          return {
            ok: false,
            error: new AppError(ERROR_CODES.TOKEN_ALREADY_ROTATED, 401, 'Token already rotated'),
          };
        }

        const refreshToken = generateOpaqueToken();
        await tx.refreshToken.create({
          data: {
            sessionId: stored.sessionId,
            tokenHash: hashToken(refreshToken),
            expiresAt: stored.session.expiresAt,
          },
        });
        await tx.userSession.update({
          where: { id: stored.sessionId },
          data: { lastSeenAt: now },
        });
        const accessToken = await this.signAccessToken({
          userId: stored.session.userId,
          sessionId: stored.sessionId,
          tenantId: stored.session.activeTenantId,
          kind: stored.session.user.kind,
        });
        return {
          ok: true,
          tokens: {
            sessionId: stored.sessionId,
            userId: stored.session.userId,
            accessToken,
            refreshToken,
          },
        };
      },
    );

    if (outcome.ok) {
      return outcome.tokens;
    }
    if (outcome.revokeSessionId) {
      await this.revoke(outcome.revokeSessionId, 'REFRESH_TOKEN_REUSE');
      this.metrics.authFailures.inc({ reason: 'refresh_reuse' });
      await this.audit.recordStandalone({
        action: 'auth.refresh_reuse_detected',
        actorUserId: outcome.userId ?? null,
        targetType: 'session',
        targetId: outcome.revokeSessionId,
        outcome: 'DENIED',
      });
    }
    throw outcome.error;
  }

  /** Points the session at another tenant and returns a new access token for it. */
  /**
   * Moves a session off a tenant it has lost access to. Conditional on the old value, so it
   * cannot undo a switch the user made at the same moment.
   */
  async moveOffTenant(sessionId: string, from: string | null, to: string | null): Promise<void> {
    await this.database.global.userSession.updateMany({
      where: { id: sessionId, activeTenantId: from },
      data: { activeTenantId: to },
    });
  }

  async switchTenant(
    sessionId: string,
    userId: string,
    kind: UserKind,
    tenantId: string,
  ): Promise<string> {
    await this.database.global.userSession.update({
      where: { id: sessionId },
      data: { activeTenantId: tenantId },
    });
    return this.signAccessToken({ userId, sessionId, tenantId, kind });
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.database.global.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  /** Runs inside the caller's transaction when given one, so it can commit with their change. */
  async revokeAllForUser(
    userId: string,
    reason: string,
    tx: Pick<Tx, 'userSession'> = this.database.global,
  ): Promise<number> {
    const { count } = await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return count;
  }

  async listForUser(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await this.database.global.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((session) => ({
      id: session.id,
      deviceLabel: session.deviceLabel,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  /** The user id in the filter stops one user revoking another user's session. */
  async revokeOwned(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.database.global.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'USER_REVOKED' },
    });
    if (count === 0) {
      throw AppError.notFound('Session not found');
    }
  }

  private signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, tid: claims.tenantId, kind: claims.kind })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.signingKey);
  }
}
