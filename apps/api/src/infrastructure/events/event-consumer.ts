import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
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

/** Token for consumers handed to the dispatcher directly, as tests do. */
export const EVENT_CONSUMERS = Symbol('EVENT_CONSUMERS');

const CONSUMER_METADATA = 'impulse:event-consumer';

/**
 * Marks a module's provider as an event consumer. The dispatcher finds marked providers when
 * the application starts, so a module registers a consumer by declaring it as a provider.
 */
export const ConsumesEvents = (): ClassDecorator => SetMetadata(CONSUMER_METADATA, true);

@Injectable()
export class EventDispatcher implements OnApplicationBootstrap {
  private readonly consumers: EventConsumer[];

  constructor(
    private readonly database: TenantDatabase,
    @Optional() @Inject(EVENT_CONSUMERS) consumers: EventConsumer[] = [],
    @Optional() private readonly discovery?: DiscoveryService,
    @Optional() private readonly reflector?: Reflector,
  ) {
    this.consumers = [...consumers];
  }

  onApplicationBootstrap(): void {
    if (!this.discovery || !this.reflector) {
      return;
    }
    const reflector = this.reflector;
    const names = new Set(this.consumers.map((consumer) => consumer.name));
    for (const wrapper of this.discovery.getProviders()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !instance || !reflector.get<boolean>(CONSUMER_METADATA, metatype)) {
        continue;
      }
      const consumer = instance as EventConsumer;
      // Names key idempotency records, so two consumers sharing one would skip each other's work.
      if (names.has(consumer.name)) {
        throw new Error(`Two event consumers are named "${consumer.name}"`);
      }
      names.add(consumer.name);
      this.consumers.push(consumer);
    }
  }

  /** The names of the consumers this dispatcher runs. For startup checks and tests. */
  consumerNames(): string[] {
    return this.consumers.map((consumer) => consumer.name);
  }

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
