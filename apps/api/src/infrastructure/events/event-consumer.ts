import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type DomainEventEnvelope,
  type EventType,
  domainEventEnvelopeSchema,
  parseEventPayload,
} from '@impulse/contracts';
import { TenantDatabase, type Tx } from '../database/tenant-database.js';

export interface EventConsumer {
  /** Stable name. It keys idempotency records, so renaming one replays its events. */
  readonly name: string;
  readonly eventTypes: readonly EventType[];
  handle(event: DomainEventEnvelope, tx: Tx): Promise<void>;
}

/** Multi-provider token that modules use to register their consumers. */
export const EVENT_CONSUMERS = Symbol('EVENT_CONSUMERS');

@Injectable()
export class EventDispatcher {
  constructor(
    private readonly database: TenantDatabase,
    @Optional() @Inject(EVENT_CONSUMERS) private readonly consumers: EventConsumer[] = [],
  ) {}

  /** Runs each subscribed consumer once. Throwing makes the queue retry the event. */
  async dispatch(raw: unknown): Promise<void> {
    const envelope = domainEventEnvelopeSchema.parse(raw);
    const event: DomainEventEnvelope = {
      ...envelope,
      payload: parseEventPayload(envelope.type, envelope.payload),
    };

    for (const consumer of this.consumers) {
      if (consumer.eventTypes.includes(event.type)) {
        await this.consumeOnce(consumer, event);
      }
    }
  }

  private async consumeOnce(consumer: EventConsumer, event: DomainEventEnvelope): Promise<void> {
    // Tenant context travels with the event, so background work is held to the same RLS rules.
    await this.database.run({ tenantId: event.tenantId }, async (tx) => {
      const claimed = await tx.$executeRaw`
        INSERT INTO consumed_events (event_id, consumer)
        VALUES (${event.id}::uuid, ${consumer.name})
        ON CONFLICT DO NOTHING`;
      if (claimed === 0) {
        return;
      }
      await consumer.handle(event, tx);
    });
  }
}
