import { Injectable } from '@nestjs/common';
import { type ContentAction, type ContentState, ERROR_CODES } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import type { Tx } from '../../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../../infrastructure/events/outbox-writer.js';
import { AuditLog } from '../../audit/index.js';
import { decideTransition } from '../domain/lifecycle.js';
import { refusalError } from '../domain/refusals.js';
import { ContentReviewLog } from './review-log.js';

/** The columns a lifecycle step writes. Every versions table has these. */
export interface VersionStepData {
  state: ContentState;
  submittedAt?: Date;
  reviewedBy?: string;
  reviewNote?: string | null;
  publishedAt?: Date;
}

/**
 * How one kind of versioned content plugs into the shared lifecycle. Each module supplies its
 * own table access, so the content module never touches another module's tables.
 */
export interface VersionedTarget {
  /** For example "question" or "lesson". Used in history, audit and events. */
  itemType: string;
  itemId: string;
  version: { id: string; state: ContentState; authorId: string };
  /** Archives whatever version of the item is published now. Runs before publishing. */
  retirePublished(tx: Tx): Promise<void>;
  /** Writes the step only if the version is still in `from`. Returns the rows changed. */
  writeStep(tx: Tx, from: ContentState, data: VersionStepData): Promise<number>;
  /** Content-specific checks, such as every referenced question being published. */
  beforeStep?(tx: Tx, action: ContentAction): Promise<void>;
}

/**
 * Applies one lifecycle step inside the caller's transaction: the shared rules, a race-safe
 * update, review history, audit, and a content.published event, all committing together.
 */
@Injectable()
export class ContentTransitions {
  constructor(
    private readonly reviews: ContentReviewLog,
    private readonly audit: AuditLog,
    private readonly outbox: OutboxWriter,
  ) {}

  async apply(
    tx: Tx,
    actor: TenantActor,
    target: VersionedTarget,
    action: ContentAction,
    reason?: string,
  ): Promise<void> {
    const decision = decideTransition(target.version, action, actor, { reason });
    if (!decision.ok) {
      throw refusalError(decision.reason);
    }
    await target.beforeStep?.(tx, action);

    const now = new Date();
    if (action === 'publish') {
      // The previous live version retires first, so the one-published index never trips.
      await target.retirePublished(tx);
    }
    const changed = await target.writeStep(tx, decision.from, {
      state: decision.to,
      ...(action === 'submit' ? { submittedAt: now } : {}),
      ...(action === 'approve' ? { reviewedBy: actor.userId, reviewNote: null } : {}),
      ...(action === 'reject' ? { reviewedBy: actor.userId, reviewNote: reason } : {}),
      ...(action === 'publish' ? { publishedAt: now } : {}),
    });
    if (changed === 0) {
      throw AppError.conflict(
        ERROR_CODES.CONTENT_STATE_INVALID,
        'This version changed while you were looking at it',
      );
    }

    await this.reviews.record(tx, {
      tenantId: actor.tenantId,
      itemType: target.itemType,
      versionId: target.version.id,
      action,
      from: decision.from,
      to: decision.to,
      actorId: actor.userId,
      note: reason,
    });
    await this.audit.record(tx, {
      action: `${target.itemType}.version_${action}`,
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      targetType: `${target.itemType}_version`,
      targetId: target.version.id,
    });
    if (action === 'publish') {
      await this.outbox.append(tx, {
        type: 'content.published',
        aggregateId: target.itemId,
        tenantId: actor.tenantId,
        payload: {
          itemType: target.itemType,
          itemId: target.itemId,
          versionId: target.version.id,
        },
      });
    }
  }
}
