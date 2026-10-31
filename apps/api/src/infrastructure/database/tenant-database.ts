import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/** A transaction with tenant context applied. Rows of other tenants do not exist inside it. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export interface DatabaseScope {
  tenantId?: string | null;
  userId?: string | null;
}

/**
 * Request-path database access, connected as the `impulse_app` role so RLS always applies.
 *
 * `global` reaches platform-global tables. Tenant tables read through it return no rows, because
 * RLS fails closed when no tenant context is set. Tenant data must go through `run`.
 */
@Injectable()
export class TenantDatabase implements OnModuleDestroy {
  readonly global: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.global = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: config.DATABASE_URL,
        max: config.DATABASE_POOL_MAX,
      }),
    });
  }

  /**
   * Runs work in a transaction with the given context. The settings are transaction-local, so
   * they end with the transaction and cannot reach the next user of a pooled connection.
   * Keep transactions short: never wrap network calls or password hashing in one.
   */
  run<T>(scope: DatabaseScope, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.global.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT
        set_config('app.tenant_id', ${scope.tenantId ?? ''}, true),
        set_config('app.user_id', ${scope.userId ?? ''}, true)`;
      return work(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.global.$disconnect();
  }
}
