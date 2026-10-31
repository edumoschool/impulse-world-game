import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES, type MfaEnrollment } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
} from '../domain/totp.js';

@Injectable()
export class MfaService {
  private readonly key: Buffer;

  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.key = Buffer.from(config.AUTH_ENCRYPTION_KEY, 'base64');
  }

  async isEnabled(userId: string): Promise<boolean> {
    const factor = await this.database.global.userMfaFactor.findUnique({ where: { userId } });
    return Boolean(factor?.confirmedAt);
  }

  /** Starts enrollment. A confirmed factor cannot be replaced through this path. */
  async enroll(userId: string, accountLabel: string): Promise<MfaEnrollment> {
    if (await this.isEnabled(userId)) {
      throw AppError.conflict(ERROR_CODES.CONFLICT, 'MFA is already enabled');
    }
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, this.key);
    await this.database.global.userMfaFactor.upsert({
      where: { userId },
      create: { userId, secretEncrypted },
      update: { secretEncrypted, lastUsedStep: null },
    });
    return { secret, otpauthUri: otpauthUri(secret, accountLabel) };
  }

  async confirm(userId: string, code: string, sessionId: string): Promise<void> {
    if (!(await this.consumeCode(userId, code))) {
      throw new AppError(ERROR_CODES.MFA_INVALID, 400, 'Incorrect verification code');
    }
    await this.database.global.$transaction(async (tx) => {
      await tx.userMfaFactor.update({ where: { userId }, data: { confirmedAt: new Date() } });
      await tx.userSession.update({
        where: { id: sessionId },
        data: { mfaVerifiedAt: new Date() },
      });
      await this.audit.record(tx, { action: 'auth.mfa_enabled', actorUserId: userId });
    });
  }

  verify(userId: string, code: string): Promise<boolean> {
    return this.consumeCode(userId, code);
  }

  /** Accepts a code at most once. The compare on the stored step closes the race on replay. */
  private async consumeCode(userId: string, code: string): Promise<boolean> {
    const factor = await this.database.global.userMfaFactor.findUnique({ where: { userId } });
    if (!factor) {
      return false;
    }
    const secret = decryptSecret(factor.secretEncrypted, this.key);
    const step = matchTotp(secret, code, Date.now() / 1000, factor.lastUsedStep);
    if (step === null) {
      return false;
    }
    const { count } = await this.database.global.userMfaFactor.updateMany({
      where: { id: factor.id, lastUsedStep: factor.lastUsedStep },
      data: { lastUsedStep: step },
    });
    return count === 1;
  }
}
