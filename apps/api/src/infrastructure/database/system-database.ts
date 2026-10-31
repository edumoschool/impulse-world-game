import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Connects as `impulse_system`, which bypasses RLS. Only cross-tenant platform work may use this:
 * the outbox relay and audited platform administration. `.dependency-cruiser.cjs` restricts who
 * can import it, and adding a caller there needs review.
 */
@Injectable()
export class SystemDatabase implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: config.SYSTEM_DATABASE_URL, max: 5 }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
