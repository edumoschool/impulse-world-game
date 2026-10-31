import { Injectable, Logger } from '@nestjs/common';
import { currentRequestId } from '../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../infrastructure/database/tenant-database.js';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AuditEntry {
  action: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  outcome?: AuditOutcome;
  /** Identifiers and enums only. Never names, emails or free text (ADR-006). */
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditLog {
  private readonly logger = new Logger(AuditLog.name);

  constructor(private readonly database: TenantDatabase) {}

  /**
   * Records inside the caller's transaction, so the trail commits with the action it describes.
   * Uses createMany because it issues no RETURNING: under RLS that would also need read access to
   * the new row, and platform-level rows with no tenant are unreadable from this role by design.
   */
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.createMany({ data: [toRow(entry)] });
  }

  /**
   * For events with no surrounding transaction, such as failed logins. A failure here is logged
   * and swallowed, because the audit write must not turn a rejection into a server error.
   */
  async recordStandalone(entry: AuditEntry): Promise<void> {
    try {
      await this.database.run({ tenantId: entry.tenantId, userId: entry.actorUserId }, (tx) =>
        this.record(tx, entry),
      );
    } catch (err) {
      this.logger.error({ err, action: entry.action }, 'Failed to write audit entry');
    }
  }
}

function toRow(entry: AuditEntry) {
  return {
    action: entry.action,
    tenantId: entry.tenantId ?? null,
    actorUserId: entry.actorUserId ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    outcome: entry.outcome ?? 'SUCCESS',
    requestId: currentRequestId(),
    metadata: entry.metadata ?? {},
  };
}
