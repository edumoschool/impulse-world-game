import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateInvitationRequest,
  type CreateOrganizationUnitRequest,
  ERROR_CODES,
  type InvitationView,
  type MemberView,
  type OrganizationKind,
  type OrganizationView,
  type RoleKey,
  type TenantAssignableRole,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { EmailSender } from '../../../infrastructure/email/email-sender.js';
import { renderEmail } from '../../../infrastructure/email/email-templates.js';
import { OutboxWriter } from '../../../infrastructure/events/outbox-writer.js';
import { AuditLog } from '../../audit/index.js';
import {
  AccountService,
  generateOpaqueToken,
  hashToken,
  normalizeEmail,
  RoleCatalog,
} from '../../identity/index.js';
import { canCreateUnit, type UnitParent } from '../domain/organization-tree.js';
import { buildInvitationToken, INVITATION_TTL_MS } from '../domain/invitation-token.js';

export interface PendingInvitation {
  email: string;
  roleKey: TenantAssignableRole;
  organizationId: string;
  guardianChildId?: string;
  relationship?: string;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly roles: RoleCatalog,
    private readonly accounts: AccountService,
    private readonly audit: AuditLog,
    private readonly outbox: OutboxWriter,
    private readonly email: EmailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createRoot(tx: Tx, tenantId: string, name: string): Promise<string> {
    const root = await tx.organization.create({ data: { tenantId, kind: 'ROOT', name } });
    return root.id;
  }

  async rootId(tx: Tx, tenantId: string): Promise<string> {
    const root = await tx.organization.findFirstOrThrow({
      where: { tenantId, kind: 'ROOT' },
      select: { id: true },
    });
    return root.id;
  }

  /** Idempotent, so accepting a second invitation to one tenant cannot duplicate a membership. */
  async addMember(
    tx: Tx,
    member: { tenantId: string; organizationId: string; userId: string },
  ): Promise<void> {
    await tx.organizationMember.upsert({
      where: {
        tenantId_organizationId_userId: {
          tenantId: member.tenantId,
          organizationId: member.organizationId,
          userId: member.userId,
        },
      },
      create: member,
      update: { status: 'ACTIVE', removedAt: null },
    });
    await this.outbox.append(tx, {
      type: 'member.joined',
      aggregateId: member.organizationId,
      tenantId: member.tenantId,
      payload: { userId: member.userId, organizationId: member.organizationId },
    });
  }

  async grantRole(
    tx: Tx,
    grant: {
      tenantId: string;
      organizationId: string;
      userId: string;
      role: RoleKey;
      grantedBy: string | null;
    },
  ): Promise<void> {
    const roleId = await this.roles.roleId(grant.role);
    const existing = await tx.userRole.findFirst({
      where: { userId: grant.userId, roleId, tenantId: grant.tenantId },
    });
    if (existing) {
      return;
    }
    await tx.userRole.create({
      data: {
        userId: grant.userId,
        roleId,
        tenantId: grant.tenantId,
        organizationId: grant.organizationId,
        grantedBy: grant.grantedBy,
      },
    });
  }

  listUnits(actor: TenantActor): Promise<OrganizationView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const units = await tx.organization.findMany({ orderBy: { createdAt: 'asc' } });
      return units.map(toView);
    });
  }

  createUnit(
    actor: TenantActor,
    request: CreateOrganizationUnitRequest,
  ): Promise<OrganizationView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const parent = await this.findParent(tx, request.parentId);
      if (!parent) {
        throw AppError.notFound('Parent organization not found');
      }
      if (!canCreateUnit(parent, request.kind)) {
        throw AppError.conflict(
          ERROR_CODES.CONFLICT,
          `A ${request.kind.toLowerCase()} cannot be placed under a ${parent.kind.toLowerCase()}`,
        );
      }
      const unit = await tx.organization.create({
        data: {
          tenantId: actor.tenantId,
          parentId: request.parentId,
          kind: request.kind,
          name: request.name,
        },
      });
      await this.audit.record(tx, {
        action: 'organization.unit_created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'organization',
        targetId: unit.id,
      });
      return toView(unit);
    });
  }

  async listMembers(actor: TenantActor): Promise<MemberView[]> {
    const { members, roles } = await this.database.run(scopeOf(actor), async (tx) => ({
      // Explicit tenant filter: RLS also lets a user read their own memberships in other tenants.
      members: await tx.organizationMember.findMany({
        where: { tenantId: actor.tenantId, status: 'ACTIVE' },
        orderBy: { joinedAt: 'asc' },
      }),
      roles: await tx.userRole.findMany({ where: { tenantId: actor.tenantId } }),
    }));
    const names = await this.accounts.displayNames(members.map((member) => member.userId));
    return Promise.all(
      members.map(async (member) => ({
        userId: member.userId,
        displayName: names.get(member.userId) ?? '',
        organizationId: member.organizationId,
        roles: await this.roles.keysFor(
          roles.filter((role) => role.userId === member.userId).map((role) => role.roleId),
        ),
        joinedAt: member.joinedAt.toISOString(),
      })),
    );
  }

  /** Revokes tenant access at once. The auth guard re-checks membership on each request. */
  async removeMember(actor: TenantActor, userId: string): Promise<void> {
    const ownerRoleId = await this.roles.roleId('ORGANIZATION_OWNER');
    await this.database.run(scopeOf(actor), async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { tenantId: actor.tenantId, userId, status: 'ACTIVE' },
      });
      if (!member) {
        throw AppError.notFound('Member not found');
      }

      const owners = await tx.userRole.findMany({
        where: { tenantId: actor.tenantId, roleId: ownerRoleId },
        select: { userId: true },
      });
      const isOwner = owners.some((owner) => owner.userId === userId);
      if (isOwner && owners.length === 1) {
        throw AppError.conflict(
          ERROR_CODES.LAST_OWNER,
          'An organization must keep at least one owner',
        );
      }

      await tx.organizationMember.updateMany({
        where: { tenantId: actor.tenantId, userId, status: 'ACTIVE' },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      await tx.userRole.deleteMany({ where: { userId, tenantId: actor.tenantId } });
      await this.audit.record(tx, {
        action: 'organization.member_removed',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'user',
        targetId: userId,
      });
    });
  }

  /** Invitations that can still be accepted. Guardian invitations are managed with the child. */
  async listPendingInvitations(actor: TenantActor): Promise<InvitationView[]> {
    const pending = await this.database.run(scopeOf(actor), (tx) =>
      tx.organizationInvitation.findMany({
        where: {
          tenantId: actor.tenantId,
          acceptedAt: null,
          revokedAt: null,
          guardianChildId: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return pending.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.roleKey as InvitationView['role'],
      expiresAt: invitation.expiresAt.toISOString(),
    }));
  }

  async revokeInvitation(actor: TenantActor, invitationId: string): Promise<void> {
    await this.database.run(scopeOf(actor), async (tx) => {
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitationId, tenantId: actor.tenantId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) {
        throw AppError.notFound('Invitation not found');
      }
      await this.audit.record(tx, {
        action: 'organization.invitation_revoked',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'invitation',
        targetId: invitationId,
      });
    });
  }

  async invite(actor: TenantActor, request: CreateInvitationRequest): Promise<InvitationView> {
    return this.createInvitation(actor, {
      email: request.email,
      roleKey: request.role,
      organizationId: request.organizationId,
    });
  }

  /** Used directly for guardian invitations, which also carry the child to link. */
  async createInvitation(actor: TenantActor, pending: PendingInvitation): Promise<InvitationView> {
    const secret = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const email = normalizeEmail(pending.email);

    const { invitation, organizationName } = await this.database.run(scopeOf(actor), async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: pending.organizationId },
      });
      if (!organization) {
        throw AppError.notFound('Organization not found');
      }
      const created = await tx.organizationInvitation.create({
        data: {
          tenantId: actor.tenantId,
          organizationId: pending.organizationId,
          email,
          roleKey: pending.roleKey,
          tokenHash: hashToken(secret),
          invitedBy: actor.userId,
          guardianChildId: pending.guardianChildId ?? null,
          relationship: pending.relationship ?? null,
          expiresAt,
        },
      });
      await this.audit.record(tx, {
        action: 'organization.member_invited',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'invitation',
        targetId: created.id,
        metadata: { role: pending.roleKey },
      });
      return { invitation: created, organizationName: organization.name };
    });

    // The invitee may have no account yet, so the email uses the inviter's language.
    const { locale } = await this.accounts.summarize(actor.userId);
    const code = buildInvitationToken(actor.tenantId, secret);
    await this.email.send(
      renderEmail('invitation', locale, email, {
        organization: organizationName,
        code,
        link: `${this.config.WEB_ORIGIN}/invitations/accept?code=${encodeURIComponent(code)}`,
      }),
    );
    return {
      id: invitation.id,
      email,
      role: pending.roleKey,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private findParent(tx: Tx, id: string): Promise<UnitParent | null> {
    return tx.organization.findUnique({ where: { id }, select: { kind: true } });
  }
}

function scopeOf(actor: TenantActor) {
  return { tenantId: actor.tenantId, userId: actor.userId };
}

function toView(unit: {
  id: string;
  name: string;
  kind: OrganizationKind;
  parentId: string | null;
}): OrganizationView {
  return { id: unit.id, name: unit.name, kind: unit.kind, parentId: unit.parentId };
}
