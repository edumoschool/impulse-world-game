import { Injectable } from '@nestjs/common';
import type { ContentAction, ContentState } from '@impulse/contracts';
import type { Tx } from '../../../infrastructure/database/tenant-database.js';

export interface ReviewEntry {
  tenantId: string;
  /** The kind of content, which names the versions table, such as "question". */
  itemType: string;
  versionId: string;
  action: ContentAction;
  from: ContentState;
  to: ContentState;
  actorId: string;
  note?: string;
}

/** Append-only lifecycle history, written in the same transaction as the state change. */
@Injectable()
export class ContentReviewLog {
  async record(tx: Tx, entry: ReviewEntry): Promise<void> {
    // createMany issues no RETURNING, matching the append-only grant.
    await tx.contentReview.createMany({
      data: [
        {
          tenantId: entry.tenantId,
          itemType: entry.itemType,
          versionId: entry.versionId,
          action: entry.action,
          fromState: entry.from,
          toState: entry.to,
          actorId: entry.actorId,
          note: entry.note ?? null,
        },
      ],
    });
  }
}
