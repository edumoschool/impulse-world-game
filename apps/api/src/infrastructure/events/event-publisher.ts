import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { DomainEventEnvelope } from '@impulse/contracts';
import { Queue } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';

export const DOMAIN_EVENTS_QUEUE = 'domain-events';

export function bullConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    // BullMQ blocks on Redis commands, which requires unlimited retries on its connections.
    maxRetriesPerRequest: null,
  };
}

/** Port between the relay and the queue. */
export abstract class EventPublisher {
  abstract publish(events: DomainEventEnvelope[]): Promise<void>;
}

@Injectable()
export class BullEventPublisher extends EventPublisher implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.queue = new Queue(DOMAIN_EVENTS_QUEUE, {
      connection: bullConnection(config.REDIS_URL),
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800 },
      },
    });
  }

  async publish(events: DomainEventEnvelope[]): Promise<void> {
    // The job id is the event id, so a relay retry cannot create a second job.
    await this.queue.addBulk(
      events.map((event) => ({ name: event.type, data: event, opts: { jobId: event.id } })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
