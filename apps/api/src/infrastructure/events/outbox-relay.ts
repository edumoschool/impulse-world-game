import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope, EventType } from '@impulse/contracts';
import { SystemDatabase } from '../database/system-database.js';
import { EventPublisher } from './event-publisher.js';

interface OutboxRow {
  id: string;
  tenant_id: string | null;
  type: string;
  version: number;
  aggregate_id: string;
  correlation_id: string;
  payload: unknown;
  occurred_at: Date;
}

/** Moves committed events to the queue. Delivery is at-least-once (ADR-007). */
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly database: SystemDatabase,
    private readonly publisher: EventPublisher,
  ) {}

  /**
   * Publishes one batch and returns how many events moved. SKIP LOCKED lets several workers run
   * without blocking each other or claiming the same rows. If publishing fails the transaction
   * rolls back, so the rows stay unpublished and are retried.
   */
  async drain(batchSize = 100): Promise<number> {
    return this.database.client.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, tenant_id, type, version, aggregate_id, correlation_id, payload, occurred_at
          FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY occurred_at
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) {
          return 0;
        }

        await this.publisher.publish(rows.map(toEnvelope));
        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
        return rows.length;
      },
      { timeout: 15_000 },
    );
  }
}

function toEnvelope(row: OutboxRow): DomainEventEnvelope {
  return {
    id: row.id,
    type: row.type as EventType,
    version: row.version,
    aggregateId: row.aggregate_id,
    tenantId: row.tenant_id,
    occurredAt: row.occurred_at.toISOString(),
    correlationId: row.correlation_id,
    payload: row.payload as DomainEventEnvelope['payload'],
  };
}
