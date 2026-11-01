import { Inject, Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  type MfaEnrollment,
  type MfaRecoveryCodes,
  type MfaStatus,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from '../domain/recovery-codes.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  matchTotp,
  otpauthUri,
} from '../domain/totp.js';
import { AccountService } from './account.service.js';

type GlobalTx = Parameters<Parameters<TenantDatabase['global']['$transaction']>[0]>[0];

@Injectable()
export class MfaService {
  private readonly key: Buffer;

  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly accounts: AccountService,
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

  /** Confirms the factor and issues the first set of recovery codes, all in one transaction. */
  async confirm(userId: string, code: string, sessionId: string): Promise<MfaRecoveryCodes> {
    if (await this.isEnabled(userId)) {
      throw AppError.conflict(ERROR_CODES.CONFLICT, 'MFA is already enabled');
    }
    if (!(await this.consumeCode(userId, code))) {
      throw new AppError(ERROR_CODES.MFA_INVALID, 400, 'Incorrect verification code');
    }
    return this.database.global.$transaction(async (tx) => {
      await tx.userMfaFactor.update({ where: { userId }, data: { confirmedAt: new Date() } });
      await tx.userSession.update({
        where: { id: sessionId },
        data: { mfaVerifiedAt: new Date() },
      });
      const recoveryCodes = await this.replaceRecoveryCodes(tx, userId);
      await this.audit.record(tx, { action: 'auth.mfa_enabled', actorUserId: userId });
      return { recoveryCodes };
    });
  }

  async status(userId: string): Promise<MfaStatus> {
    const [enabled, recoveryCodesRemaining] = await Promise.all([
      this.isEnabled(userId),
      this.database.global.userMfaRecoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { enabled, recoveryCodesRemaining: enabled ? recoveryCodesRemaining : 0 };
  }

  /** Replaces every recovery code. Needs a fresh authenticator code, not just a session. */
  async regenerateRecoveryCodes(userId: string, code: string): Promise<MfaRecoveryCodes> {
    if (!(await this.isEnabled(userId)) || !(await this.consumeCode(userId, code))) {
      throw new AppError(ERROR_CODES.MFA_INVALID, 400, 'Incorrect verification code');
    }
    return this.database.global.$transaction(async (tx) => {
      const recoveryCodes = await this.replaceRecoveryCodes(tx, userId);
      await this.audit.record(tx, {
        action: 'auth.mfa_recovery_codes_issued',
        actorUserId: userId,
      });
      return { recoveryCodes };
    });
  }

  /**
   * Turns MFA off. Needs the password and a second factor, so neither a stolen session nor a
   * stolen password is enough. A recovery code counts, so a lost phone does not lock the user out.
   */
  async disable(userId: string, password: string, code: string): Promise<void> {
    const passwordValid = await this.accounts.verifySecret(userId, password);
    // Checked only after the password, so a wrong password never spends a code.
    const factorValid =
      passwordValid &&
      (await this.isEnabled(userId)) &&
      (/^\d{6}$/.test(code)
        ? await this.consumeCode(userId, code)
        : await this.useRecoveryCode(userId, code));
    if (!factorValid) {
      throw new AppError(
        ERROR_CODES.INVALID_CREDENTIALS,
        400,
        'The password or verification code is incorrect',
      );
    }
    await this.database.global.$transaction(async (tx) => {
      await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.userMfaFactor.delete({ where: { userId } });
      await this.audit.record(tx, { action: 'auth.mfa_disabled', actorUserId: userId });
    });
  }

  /** Spends one recovery code. The conditional update means two racing uses cannot both pass. */
  async useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const { count } = await this.database.global.userMfaRecoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(code, this.key), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 1) {
      await this.audit.recordStandalone({
        action: 'auth.mfa_recovery_code_used',
        actorUserId: userId,
      });
    }
    return count === 1;
  }

  private async replaceRecoveryCodes(tx: GlobalTx, userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await tx.userMfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.userMfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code, this.key) })),
    });
    return codes;
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
