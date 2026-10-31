import { Injectable } from '@nestjs/common';
import {
  type ChildSettings,
  type ChildView,
  type ConsentGrant,
  type ConsentView,
  type CreateChildRequest,
  ERROR_CODES,
  type GuardianView,
  type Locale,
  type UpdateChildSettingsRequest,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../../infrastructure/events/outbox-writer.js';
import { AuditLog } from '../../audit/index.js';
import { GuardianService } from '../../guardians/index.js';
import { AccountService, SessionService } from '../../identity/index.js';
import { OrganizationService } from '../../organizations/index.js';
import {
  canRemoveGuardian,
  type ChildAccessSubject,
  childAccessPolicy,
  hasAccountAccessConsent,
} from '../domain/child-access-policy.js';

interface ChildRow {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  birthYear: number;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  settings: {
    dailyMinutesLimit: number | null;
    aiTutorEnabled: boolean;
    leaderboardsEnabled: boolean;
    notificationsEnabled: boolean;
  } | null;
}

const withSettings = { settings: true } as const;

@Injectable()
export class ChildService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly accounts: AccountService,
    private readonly sessions: SessionService,
    private readonly organizations: OrganizationService,
    private readonly guardians: GuardianService,
    private readonly audit: AuditLog,
    private readonly outbox: OutboxWriter,
  ) {}

  async create(actor: TenantActor, request: CreateChildRequest): Promise<ChildView> {
    // A parent's consent is parental. Staff provisioning for a school is a different legal basis.
    const isParent = actor.permissions.has('parent.view_child_progress');
    const basis = isParent ? 'PARENTAL' : 'SCHOOL_AUTHORIZED';

    // Argon2id is deliberately slow, so it runs before the transaction opens.
    const passwordHash = await this.accounts.hashSecret(request.passcode);

    try {
      return await this.database.run(scopeOf(actor), async (tx) => {
        const userId = await this.accounts.createChild(tx, {
          displayName: request.displayName,
          locale: request.locale,
          passwordHash,
        });
        const child = await tx.childProfile.create({
          data: {
            tenantId: actor.tenantId,
            userId,
            username: request.username,
            displayName: request.displayName,
            birthYear: request.birthYear,
            createdBy: actor.userId,
            settings: { create: {} },
          },
          include: withSettings,
        });

        const organizationId = await this.organizations.rootId(tx, actor.tenantId);
        await this.organizations.addMember(tx, {
          tenantId: actor.tenantId,
          organizationId,
          userId,
        });
        await this.organizations.grantRole(tx, {
          tenantId: actor.tenantId,
          organizationId,
          userId,
          role: 'CHILD',
          grantedBy: actor.userId,
        });
        if (isParent) {
          await this.guardians.link(tx, {
            tenantId: actor.tenantId,
            childId: child.id,
            userId: actor.userId,
            relationship: 'parent',
          });
        }

        const consent = await tx.childConsent.create({
          data: {
            tenantId: actor.tenantId,
            childId: child.id,
            policyVersion: request.consent.policyVersion,
            scopes: request.consent.scopes,
            basis,
            grantedBy: actor.userId,
          },
        });

        await this.audit.record(tx, {
          action: 'child.provisioned',
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          targetType: 'child',
          targetId: child.id,
          metadata: { basis, policyVersion: request.consent.policyVersion },
        });
        await this.outbox.append(tx, {
          type: 'user.created',
          aggregateId: userId,
          tenantId: actor.tenantId,
          payload: { userId, kind: 'CHILD' },
        });
        await this.outbox.append(tx, {
          type: 'child.authorized',
          aggregateId: child.id,
          tenantId: actor.tenantId,
          payload: { childId: child.id, consentId: consent.id },
        });
        return toChildView(child, request.locale);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict(ERROR_CODES.USERNAME_TAKEN, 'This username is already taken');
      }
      throw error;
    }
  }

  /** Staff see the roster. Everyone else sees only children they are linked to. */
  list(actor: TenantActor): Promise<ChildView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const where = actor.permissions.has('children.view_all')
        ? {}
        : { id: { in: await this.guardians.childIdsFor(tx, actor.userId) } };
      const children = await tx.childProfile.findMany({
        where,
        include: withSettings,
        orderBy: { createdAt: 'asc' },
      });
      return this.withLocales(children);
    });
  }

  async get(actor: TenantActor, childId: string): Promise<ChildView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const { child } = await this.load(tx, actor, childId, childAccessPolicy.canView);
      const [view] = await this.withLocales([child]);
      return view as ChildView;
    });
  }

  updateSettings(
    actor: TenantActor,
    childId: string,
    changes: UpdateChildSettingsRequest,
  ): Promise<ChildSettings> {
    return this.database.run(scopeOf(actor), async (tx) => {
      await this.load(tx, actor, childId, childAccessPolicy.canManageSettings);
      const settings = await tx.childSettings.update({ where: { childId }, data: changes });
      await this.audit.record(tx, {
        action: 'child.settings_updated',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'child',
        targetId: childId,
      });
      return toSettings(settings);
    });
  }

  listConsents(actor: TenantActor, childId: string): Promise<ConsentView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      await this.load(tx, actor, childId, childAccessPolicy.canManageConsent);
      const consents = await tx.childConsent.findMany({
        where: { childId },
        orderBy: { grantedAt: 'desc' },
      });
      return consents.map(toConsentView);
    });
  }

  grantConsent(actor: TenantActor, childId: string, grant: ConsentGrant): Promise<ConsentView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const { subject } = await this.load(tx, actor, childId, childAccessPolicy.canManageConsent);
      const consent = await tx.childConsent.create({
        data: {
          tenantId: actor.tenantId,
          childId,
          policyVersion: grant.policyVersion,
          scopes: grant.scopes,
          basis: subject.isGuardian ? 'PARENTAL' : 'SCHOOL_AUTHORIZED',
          grantedBy: actor.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'child.consent_granted',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'child',
        targetId: childId,
        metadata: { policyVersion: grant.policyVersion },
      });
      await this.outbox.append(tx, {
        type: 'child.authorized',
        aggregateId: childId,
        tenantId: actor.tenantId,
        payload: { childId, consentId: consent.id },
      });
      return toConsentView(consent);
    });
  }

  /** Ends the child's sessions in the same transaction when account access is withdrawn. */
  revokeConsent(actor: TenantActor, childId: string, consentId: string): Promise<void> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const { child } = await this.load(tx, actor, childId, childAccessPolicy.canManageConsent);
      const { count } = await tx.childConsent.updateMany({
        where: { id: consentId, childId, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: actor.userId },
      });
      if (count === 0) {
        throw AppError.notFound('Consent not found');
      }

      const remaining = await tx.childConsent.findMany({ where: { childId } });
      if (!hasAccountAccessConsent(remaining)) {
        await this.sessions.revokeAllForUser(child.userId, 'CONSENT_REVOKED', tx);
      }
      await this.audit.record(tx, {
        action: 'child.consent_revoked',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'child',
        targetId: childId,
      });
      await this.outbox.append(tx, {
        type: 'child.consent_revoked',
        aggregateId: childId,
        tenantId: actor.tenantId,
        payload: { childId, consentId },
      });
    });
  }

  async listGuardians(actor: TenantActor, childId: string): Promise<GuardianView[]> {
    const links = await this.database.run(scopeOf(actor), async (tx) => {
      await this.load(tx, actor, childId, childAccessPolicy.canManageGuardians);
      return this.guardians.list(tx, childId);
    });
    const names = await this.accounts.displayNames(links.map((link) => link.userId));
    return links.map((link) => ({
      userId: link.userId,
      displayName: names.get(link.userId) ?? '',
      relationship: link.relationship,
      linkedAt: link.linkedAt.toISOString(),
    }));
  }

  /** Confirms the actor may do this before an invitation exposes the child's tenant membership. */
  async assertCanManageGuardians(actor: TenantActor, childId: string): Promise<void> {
    await this.database.run(scopeOf(actor), (tx) =>
      this.load(tx, actor, childId, childAccessPolicy.canManageGuardians),
    );
  }

  removeGuardian(actor: TenantActor, childId: string, guardianUserId: string): Promise<void> {
    return this.database.run(scopeOf(actor), async (tx) => {
      await this.load(tx, actor, childId, childAccessPolicy.canManageGuardians);
      const links = await this.guardians.list(tx, childId);
      if (!links.some((link) => link.userId === guardianUserId)) {
        throw AppError.notFound('Guardian not found');
      }
      if (!canRemoveGuardian(links.length)) {
        throw AppError.conflict(
          ERROR_CODES.LAST_GUARDIAN,
          'A child must keep at least one guardian',
        );
      }
      await this.guardians.revoke(tx, childId, guardianUserId);
      await this.audit.record(tx, {
        action: 'child.guardian_removed',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'child',
        targetId: childId,
        metadata: { guardianUserId },
      });
    });
  }

  /**
   * Loads a child and applies one policy check. Not found and not allowed are the same response,
   * so a caller cannot discover which children exist.
   */
  private async load(
    tx: Tx,
    actor: TenantActor,
    childId: string,
    isAllowed: (subject: ChildAccessSubject, child: { userId: string }) => boolean,
  ): Promise<{ child: ChildRow; subject: ChildAccessSubject }> {
    const child = await tx.childProfile.findUnique({
      where: { id: childId },
      include: withSettings,
    });
    if (!child) {
      throw AppError.notFound('Child not found');
    }
    const subject: ChildAccessSubject = {
      userId: actor.userId,
      permissions: actor.permissions,
      isGuardian: await this.guardians.isGuardian(tx, actor.userId, childId),
    };
    if (!isAllowed(subject, child)) {
      throw AppError.notFound('Child not found');
    }
    return { child, subject };
  }

  private async withLocales(children: ChildRow[]): Promise<ChildView[]> {
    const summaries = await Promise.all(
      children.map((child) => this.accounts.summarize(child.userId)),
    );
    return children.map((child, index) => toChildView(child, summaries[index]?.locale ?? 'en'));
  }
}

function scopeOf(actor: TenantActor) {
  return { tenantId: actor.tenantId, userId: actor.userId };
}

function toSettings(settings: NonNullable<ChildRow['settings']>): ChildSettings {
  return {
    dailyMinutesLimit: settings.dailyMinutesLimit,
    aiTutorEnabled: settings.aiTutorEnabled,
    leaderboardsEnabled: settings.leaderboardsEnabled,
    notificationsEnabled: settings.notificationsEnabled,
  };
}

function toChildView(child: ChildRow, locale: Locale): ChildView {
  return {
    id: child.id,
    displayName: child.displayName,
    username: child.username,
    birthYear: child.birthYear,
    locale,
    status: child.status,
    settings: child.settings
      ? toSettings(child.settings)
      : {
          dailyMinutesLimit: null,
          aiTutorEnabled: false,
          leaderboardsEnabled: false,
          notificationsEnabled: true,
        },
    createdAt: child.createdAt.toISOString(),
  };
}

function toConsentView(consent: {
  id: string;
  policyVersion: string;
  scopes: ConsentView['scopes'];
  basis: ConsentView['basis'];
  grantedAt: Date;
  revokedAt: Date | null;
}): ConsentView {
  return {
    id: consent.id,
    policyVersion: consent.policyVersion,
    scopes: consent.scopes,
    basis: consent.basis,
    grantedAt: consent.grantedAt.toISOString(),
    revokedAt: consent.revokedAt?.toISOString() ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}
