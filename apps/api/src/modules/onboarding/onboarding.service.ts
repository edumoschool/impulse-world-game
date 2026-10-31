import { Injectable } from '@nestjs/common';
import {
  type AcceptInvitationRequest,
  type CreateInstitutionRequest,
  ERROR_CODES,
  type RegisterRequest,
  type RoleKey,
} from '@impulse/contracts';
import { AppError } from '../../common/app-error.js';
import type { Actor } from '../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../infrastructure/events/outbox-writer.js';
import { AuditLog } from '../audit/index.js';
import { GuardianService } from '../guardians/index.js';
import { AccountService, type IssuedTokens, SessionService } from '../identity/index.js';
import {
  InvitationAcceptance,
  OrganizationService,
  parseInvitationToken,
} from '../organizations/index.js';
import { TenantService } from '../tenants/index.js';

/** Composes workflows that span several domains, inside one transaction. */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly accounts: AccountService,
    private readonly sessions: SessionService,
    private readonly tenants: TenantService,
    private readonly organizations: OrganizationService,
    private readonly guardians: GuardianService,
    private readonly invitations: InvitationAcceptance,
    private readonly audit: AuditLog,
    private readonly outbox: OutboxWriter,
  ) {}

  /** A new adult gets a family tenant at once, with no half-created state possible. */
  async register(request: RegisterRequest): Promise<{ tokens: IssuedTokens; tenantId: string }> {
    const passwordHash = await this.accounts.hashSecret(request.password);
    const tenantId = this.tenants.newTenantId();

    try {
      const tokens = await this.database.run({ tenantId }, async (tx) => {
        const userId = await this.accounts.createAdult(tx, {
          email: request.email,
          displayName: request.displayName,
          locale: request.locale,
          passwordHash,
        });
        await this.createTenant(tx, {
          tenantId,
          name: request.displayName,
          kind: 'FAMILY',
          ownerUserId: userId,
          locale: request.locale,
          ownerRoles: ['ORGANIZATION_OWNER', 'PARENT'],
        });
        await this.guardians.ensureParentProfile(tx, tenantId, userId);
        await this.outbox.append(tx, {
          type: 'user.created',
          aggregateId: userId,
          tenantId,
          payload: { userId, kind: 'ADULT' },
        });
        await this.audit.record(tx, {
          action: 'auth.registered',
          tenantId,
          actorUserId: userId,
          targetType: 'user',
          targetId: userId,
        });
        return this.sessions.issue(tx, {
          userId,
          kind: 'ADULT',
          tenantId,
          deviceLabel: request.deviceLabel,
        });
      });
      return { tokens, tenantId };
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') {
        throw AppError.conflict(ERROR_CODES.EMAIL_TAKEN, 'This email is already registered');
      }
      throw error;
    }
  }

  async createInstitution(actor: Actor, request: CreateInstitutionRequest): Promise<string> {
    if (actor.kind !== 'ADULT') {
      throw AppError.forbidden();
    }
    const tenantId = this.tenants.newTenantId();
    await this.database.run({ tenantId, userId: actor.userId }, (tx) =>
      this.createTenant(tx, {
        tenantId,
        name: request.name,
        kind: request.kind,
        ownerUserId: actor.userId,
        locale: 'en',
        ownerRoles: ['ORGANIZATION_OWNER', 'SCHOOL_ADMIN'],
      }),
    );
    return tenantId;
  }

  /** The tenant comes from the token and the row must match it, so RLS scopes the whole flow. */
  async acceptInvitation(actor: Actor, request: AcceptInvitationRequest): Promise<string> {
    const parsed = parseInvitationToken(request.token);
    const email = actor.kind === 'ADULT' ? await this.accounts.getEmail(actor.userId) : null;
    if (!parsed || !email) {
      throw new AppError(
        ERROR_CODES.INVITATION_INVALID,
        400,
        'This invitation is invalid or has expired',
      );
    }

    const { tenantId, secret } = parsed;
    await this.database.run({ tenantId, userId: actor.userId }, async (tx) => {
      const invitation = await this.invitations.claim(tx, {
        secret,
        userId: actor.userId,
        userEmail: email,
      });
      await this.organizations.addMember(tx, {
        tenantId,
        organizationId: invitation.organizationId,
        userId: actor.userId,
      });
      await this.organizations.grantRole(tx, {
        tenantId,
        organizationId: invitation.organizationId,
        userId: actor.userId,
        role: invitation.roleKey as RoleKey,
        grantedBy: null,
      });
      if (invitation.roleKey === 'PARENT') {
        await this.guardians.ensureParentProfile(tx, tenantId, actor.userId);
      }
      if (invitation.guardianChildId) {
        await this.guardians.link(tx, {
          tenantId,
          childId: invitation.guardianChildId,
          userId: actor.userId,
          relationship: invitation.relationship ?? 'guardian',
        });
      }
      await this.audit.record(tx, {
        action: 'organization.invitation_accepted',
        tenantId,
        actorUserId: actor.userId,
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: { role: invitation.roleKey },
      });
    });
    return tenantId;
  }

  private async createTenant(
    tx: Tx,
    tenant: {
      tenantId: string;
      name: string;
      kind: 'FAMILY' | CreateInstitutionRequest['kind'];
      ownerUserId: string;
      locale: RegisterRequest['locale'];
      ownerRoles: RoleKey[];
    },
  ): Promise<void> {
    const { tenantId, ownerUserId } = tenant;
    await this.tenants.create(tx, {
      id: tenantId,
      name: tenant.name,
      kind: tenant.kind,
      defaultLocale: tenant.locale,
    });
    const organizationId = await this.organizations.createRoot(tx, tenantId, tenant.name);
    await this.organizations.addMember(tx, { tenantId, organizationId, userId: ownerUserId });
    for (const role of tenant.ownerRoles) {
      await this.organizations.grantRole(tx, {
        tenantId,
        organizationId,
        userId: ownerUserId,
        role,
        grantedBy: ownerUserId,
      });
    }
    await this.outbox.append(tx, {
      type: 'tenant.created',
      aggregateId: tenantId,
      tenantId,
      payload: { tenantId, kind: tenant.kind },
    });
  }
}
