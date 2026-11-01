import { Inject, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, type LoginRequest } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { EmailSender } from '../../../infrastructure/email/email-sender.js';
import { renderEmail } from '../../../infrastructure/email/email-templates.js';
import { MetricsRegistry } from '../../../infrastructure/telemetry/metrics.js';
import { AuditLog } from '../../audit/index.js';
import { generateOpaqueToken, hashToken } from '../domain/tokens.js';
import { AccessDirectory } from './access-directory.js';
import { AccountService, normalizeEmail } from './account.service.js';
import { LoginThrottle } from './login-throttle.js';
import { MfaService } from './mfa.service.js';
import { type IssuedTokens, SessionService } from './session.service.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly database: TenantDatabase,
    private readonly accounts: AccountService,
    private readonly sessions: SessionService,
    private readonly directory: AccessDirectory,
    private readonly throttle: LoginThrottle,
    private readonly mfa: MfaService,
    private readonly audit: AuditLog,
    private readonly metrics: MetricsRegistry,
    private readonly email: EmailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(request: LoginRequest): Promise<{ tokens: IssuedTokens; tenantId: string | null }> {
    const email = normalizeEmail(request.email);
    await this.throttle.assertNotLocked(email);

    const user = await this.accounts.findAdultByEmail(email);
    const passwordValid = await this.accounts.verifySecret(user?.id ?? null, request.password);
    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      await this.throttle.recordFailure(email);
      this.metrics.authFailures.inc({ reason: 'invalid_credentials' });
      await this.audit.recordStandalone({
        action: 'auth.login_failed',
        actorUserId: user?.id ?? null,
        outcome: 'DENIED',
      });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Incorrect email or password');
    }

    const mfaVerified = await this.checkMfa(user.id, request, email);
    const memberships = await this.directory.listMemberships(user.id);
    const tenantId = memberships[0]?.tenantId ?? null;

    await this.throttle.clear(email);
    const tokens = await this.database.run({ tenantId, userId: user.id }, async (tx) => {
      const issued = await this.sessions.issue(tx, {
        userId: user.id,
        kind: 'ADULT',
        tenantId,
        deviceLabel: request.deviceLabel,
        mfaVerified,
      });
      await this.audit.record(tx, {
        action: 'auth.login',
        tenantId,
        actorUserId: user.id,
        targetType: 'session',
        targetId: issued.sessionId,
      });
      return issued;
    });
    return { tokens, tenantId };
  }

  /** A wrong code counts against the same lockout as a wrong password. */
  private async checkMfa(
    userId: string,
    factor: { mfaCode?: string; recoveryCode?: string },
    throttleKey: string,
  ): Promise<boolean> {
    if (!(await this.mfa.isEnabled(userId))) {
      return false;
    }
    if (!factor.mfaCode && !factor.recoveryCode) {
      throw new AppError(ERROR_CODES.MFA_REQUIRED, 401, 'A verification code is required');
    }
    const valid = factor.mfaCode
      ? await this.mfa.verify(userId, factor.mfaCode)
      : await this.mfa.useRecoveryCode(userId, factor.recoveryCode as string);
    if (!valid) {
      await this.throttle.recordFailure(throttleKey);
      this.metrics.authFailures.inc({ reason: 'invalid_mfa' });
      throw new AppError(ERROR_CODES.MFA_INVALID, 401, 'Incorrect verification code');
    }
    return true;
  }

  async switchTenant(
    actor: { userId: string; sessionId: string; kind: 'ADULT' | 'CHILD' },
    tenantId: string,
  ): Promise<IssuedAccessToken> {
    const permissions = await this.directory.resolvePermissions(actor.userId, tenantId);
    if (!permissions) {
      await this.audit.recordStandalone({
        action: 'auth.switch_tenant_denied',
        actorUserId: actor.userId,
        targetType: 'tenant',
        targetId: tenantId,
        outcome: 'DENIED',
      });
      // Same answer as for a tenant that does not exist.
      throw AppError.notFound('Tenant not found');
    }
    const accessToken = await this.sessions.switchTenant(
      actor.sessionId,
      actor.userId,
      actor.kind,
      tenantId,
    );
    await this.audit.recordStandalone({
      action: 'auth.switch_tenant',
      tenantId,
      actorUserId: actor.userId,
    });
    return { accessToken };
  }

  /**
   * Returns before doing any account work, so response time cannot reveal whether the address
   * has an account. Failures are logged, not shown.
   */
  requestPasswordReset(email: string): void {
    void this.sendResetEmail(email).catch((err: unknown) => {
      this.logger.error({ err }, 'Failed to send password reset email');
    });
  }

  private async sendResetEmail(email: string): Promise<void> {
    const user = await this.accounts.findAdultByEmail(email);
    if (!user || user.status !== 'ACTIVE') {
      return;
    }
    const token = generateOpaqueToken();
    await this.database.global.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    const { locale } = await this.accounts.summarize(user.id);
    await this.email.send(
      renderEmail('passwordReset', locale, normalizeEmail(email), {
        link: `${this.config.WEB_ORIGIN}/reset-password?token=${token}`,
      }),
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const invalid = new AppError(
      ERROR_CODES.RESET_TOKEN_INVALID,
      400,
      'This reset link is invalid or has expired',
    );
    const stored = await this.database.global.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      throw invalid;
    }

    // Hashed before the transaction opens, because Argon2id is deliberately slow.
    const passwordHash = await this.accounts.hashSecret(newPassword);
    await this.database.global.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw invalid;
      }
      await tx.userCredential.update({
        where: { userId: stored.userId },
        data: { passwordHash, changedAt: new Date() },
      });
      // Anyone already signed in with the old password loses access now.
      await this.sessions.revokeAllForUser(stored.userId, 'PASSWORD_RESET', tx);
      await this.audit.record(tx, { action: 'auth.password_reset', actorUserId: stored.userId });
    });
  }
}

interface IssuedAccessToken {
  accessToken: string;
}
