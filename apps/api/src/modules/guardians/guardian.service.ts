import { Injectable } from '@nestjs/common';
import type { Tx } from '../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../infrastructure/events/outbox-writer.js';

export interface GuardianLink {
  userId: string;
  relationship: string;
  linkedAt: Date;
}

/** All methods run in a caller's tenant transaction, so RLS scopes every query. */
@Injectable()
export class GuardianService {
  constructor(private readonly outbox: OutboxWriter) {}

  async ensureParentProfile(tx: Tx, tenantId: string, userId: string): Promise<string> {
    const profile = await tx.parentProfile.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId },
      update: {},
    });
    return profile.id;
  }

  async link(
    tx: Tx,
    link: { tenantId: string; childId: string; userId: string; relationship: string },
  ): Promise<void> {
    const parentProfileId = await this.ensureParentProfile(tx, link.tenantId, link.userId);
    await tx.parentChildLink.upsert({
      where: {
        tenantId_childId_parentProfileId: {
          tenantId: link.tenantId,
          childId: link.childId,
          parentProfileId,
        },
      },
      create: {
        tenantId: link.tenantId,
        childId: link.childId,
        parentProfileId,
        relationship: link.relationship,
      },
      update: { status: 'ACTIVE', revokedAt: null, relationship: link.relationship },
    });
    await this.outbox.append(tx, {
      type: 'guardian.linked',
      aggregateId: link.childId,
      tenantId: link.tenantId,
      payload: { childId: link.childId, guardianUserId: link.userId },
    });
  }

  async isGuardian(tx: Tx, userId: string, childId: string): Promise<boolean> {
    const link = await tx.parentChildLink.findFirst({
      where: { childId, status: 'ACTIVE', parent: { userId } },
      select: { id: true },
    });
    return link !== null;
  }

  async childIdsFor(tx: Tx, userId: string): Promise<string[]> {
    const links = await tx.parentChildLink.findMany({
      where: { status: 'ACTIVE', parent: { userId } },
      select: { childId: true },
    });
    return links.map((link) => link.childId);
  }

  async list(tx: Tx, childId: string): Promise<GuardianLink[]> {
    const links = await tx.parentChildLink.findMany({
      where: { childId, status: 'ACTIVE' },
      include: { parent: { select: { userId: true } } },
      orderBy: { linkedAt: 'asc' },
    });
    return links.map((link) => ({
      userId: link.parent.userId,
      relationship: link.relationship,
      linkedAt: link.linkedAt,
    }));
  }

  /** Returns false when no active link exists for that guardian. */
  async revoke(tx: Tx, childId: string, userId: string): Promise<boolean> {
    const { count } = await tx.parentChildLink.updateMany({
      where: { childId, status: 'ACTIVE', parent: { userId } },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    return count > 0;
  }
}
