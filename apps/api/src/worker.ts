import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { PLATFORM_MODULES } from './app.module.js';
import { APP_CONFIG, type AppConfig, loadRootEnvFile } from './config/app-config.js';
import { EventDispatcher } from './infrastructure/events/event-consumer.js';
import { bullConnection, DOMAIN_EVENTS_QUEUE } from './infrastructure/events/event-publisher.js';
import { OutboxRelay } from './infrastructure/events/outbox-relay.js';

const RELAY_INTERVAL_MS = 1000;

@Module({ imports: PLATFORM_MODULES })
class WorkerModule {}

async function bootstrap(): Promise<void> {
  loadRootEnvFile();
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger('Worker');
  const config = app.get<AppConfig>(APP_CONFIG);
  const relay = app.get(OutboxRelay);
  const dispatcher = app.get(EventDispatcher);

  const worker = new Worker(DOMAIN_EVENTS_QUEUE, (job) => dispatcher.dispatch(job.data), {
    connection: bullConnection(config.REDIS_URL),
    concurrency: 10,
  });
  worker.on('failed', (job, err) => {
    logger.error({ err, eventId: job?.id }, 'Event handling failed');
  });

  let stopping = false;
  const loop = async () => {
    while (!stopping) {
      try {
        const moved = await relay.drain();
        if (moved > 0) {
          continue;
        }
      } catch (err) {
        logger.error({ err }, 'Outbox relay failed');
      }
      await new Promise((resolve) => setTimeout(resolve, RELAY_INTERVAL_MS));
    }
  };
  const running = loop();

  const shutdown = async () => {
    stopping = true;
    await running;
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

await bootstrap();
