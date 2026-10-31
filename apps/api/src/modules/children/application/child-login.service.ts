import { Injectable } from '@nestjs/common';
import { type ChildLoginRequest, ERROR_CODES } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { MetricsRegistry } from '../../../infrastructure/telemetry/metrics.js';
import { AuditLog } from '../../audit/index.js';
import {
  AccountService,
  type IssuedTokens,
  LoginThrottle,
  SessionService,
} from '../../identity/index.js';
import { TenantService } from '../../tenants/index.js';
import { hasAccountAccessConsent } from '../domain/child-access-policy.js';

@Injectable()
export class ChildLoginService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly tenants: TenantService,
    private readonly accounts: AccountService,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
    private readonly audit: AuditLog,
    private readonly metrics: MetricsRegistry,
  ) {}

  async login(request: ChildLoginRequest): Promise<{ tokens: IssuedTokens; tenantId: string }> {
    const username = request.username.toLowerCase();
    const tenant = await this.tenants.findByLoginCode(request.loginCode);
    const throttleKey = `child:${tenant?.id ?? request.loginCode}:${username}`;
    await this.throttle.assertNotLocked(throttleKey);

    const child =
      tenant?.status === 'ACTIVE'
        ? await this.database.run({ tenantId: tenant.id }, (tx) =>
            tx.childProfile.findUnique({
              where: { tenantId_username: { tenantId: tenant.id, username } },
              include: { consents: { select: { scopes: true, revokedAt: true } } },
            }),
          )
        : null;

    const secretValid = await this.accounts.verifySecret(child?.userId ?? null, request.passcode);
    if (!tenant || !child || !secretValid || child.status !== 'ACTIVE') {
      await this.throttle.recordFailure(throttleKey);
      this.metrics.authFailures.inc({ reason: 'invalid_child_credentials' });
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 401, 'Incorrect sign-in details');
    }
    await this.throttle.clear(throttleKey);

    // Checked after the passcode, so consent state is only shown to someone who knows it.
    if (!hasAccountAccessConsent(child.consents)) {
      throw new AppError(
        ERROR_CODES.CONSENT_REQUIRED,
        403,
        'A parent or guardian needs to approve this account',
      );
    }

    const tokens = await this.database.run(
      { tenantId: tenant.id, userId: child.userId },
      async (tx) => {
        const issued = await this.sessions.issue(tx, {
          userId: child.userId,
          kind: 'CHILD',
          tenantId: tenant.id,
          deviceLabel: request.deviceLabel,
        });
        await this.audit.record(tx, {
          action: 'auth.child_login',
          tenantId: tenant.id,
          actorUserId: child.userId,
          targetType: 'session',
          targetId: issued.sessionId,
        });
        return issued;
      },
    );
    return { tokens, tenantId: tenant.id };
  }
}
