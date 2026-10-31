import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  /** Commands fail quickly when Redis is down, so fail-open and fail-closed paths can react. */
  readonly client: Redis;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      connectTimeout: 2000,
      lazyConnect: false,
    });
    // ioredis emits an unhandled 'error' event otherwise, which would crash the process.
    this.client.on('error', () => {});
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
