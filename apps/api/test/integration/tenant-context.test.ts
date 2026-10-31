import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TenantDatabase } from '../../src/infrastructure/database/tenant-database.js';
import { parseConfig } from '../../src/config/app-config.js';

/** Verifies the two properties ADR-002 depends on: scoping, and no leakage across the pool. */
let database: TenantDatabase;

beforeAll(() => {
  database = new TenantDatabase(parseConfig({ ...process.env, DATABASE_POOL_MAX: '2' }));
});

afterAll(() => database.onModuleDestroy());

const readContext = () =>
  database.global.$queryRaw<{ tenant: string | null }[]>`
    SELECT NULLIF(current_setting('app.tenant_id', true), '') AS tenant`;

describe('TenantDatabase.run', () => {
  it('sets the tenant for the transaction', async () => {
    const tenantId = randomUUID();
    const [row] = await database.run(
      { tenantId },
      (tx) => tx.$queryRaw<{ tenant: string }[]>`SELECT app_current_tenant()::text AS tenant`,
    );
    expect(row?.tenant).toBe(tenantId);
  });

  it('does not leak context to the next user of a pooled connection', async () => {
    await database.run({ tenantId: randomUUID() }, (tx) => tx.$queryRaw`SELECT 1`);
    // With a pool of two, repeating this reuses the connection the transaction just returned.
    for (let i = 0; i < 10; i += 1) {
      const [row] = await readContext();
      expect(row?.tenant).toBeNull();
    }
  });

  it('keeps concurrent transactions separate', async () => {
    const tenants = Array.from({ length: 8 }, () => randomUUID());
    const seen = await Promise.all(
      tenants.map((tenantId) =>
        database.run({ tenantId }, async (tx) => {
          await tx.$queryRaw`SELECT pg_sleep(0.01)::text`;
          const [row] = await tx.$queryRaw<{ tenant: string }[]>`
            SELECT app_current_tenant()::text AS tenant`;
          return row?.tenant;
        }),
      ),
    );
    expect(seen).toEqual(tenants);
  });

  it('clears context even when the work throws', async () => {
    await expect(
      database.run({ tenantId: randomUUID() }, async () => {
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    const [row] = await readContext();
    expect(row?.tenant).toBeNull();
  });
});
