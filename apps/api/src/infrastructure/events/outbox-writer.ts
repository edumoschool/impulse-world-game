import { Injectable } from '@nestjs/common';
import { type EventPayload, type EventType, parseEventPayload } from '@impulse/contracts';
import { currentRequestId } from '../../common/request-context.js';
import type { Tx } from '../database/tenant-database.js';

export interface NewEvent<T extends EventType> {
  type: T;
  aggregateId: string;
  tenantId: string | null;
  payload: EventPayload<T>;
  version?: number;
}

@Injectable()
export class OutboxWriter {
  /**
   * Must be given the same transaction as the state change, so that the event commits only if
   * the change does. Payloads are validated here, which strips anything outside the contract.
   */
  async append<T extends EventType>(tx: Tx, event: NewEvent<T>): Promise<void> {
    // createMany issues no RETURNING, because the runtime role can write this table but not read it.
    await tx.outboxEvent.createMany({
      data: [
        {
          type: event.type,
          version: event.version ?? 1,
          aggregateId: event.aggregateId,
          tenantId: event.tenantId,
          correlationId: currentRequestId(),
          payload: parseEventPayload(event.type, event.payload),
        },
      ],
    });
  }
}
