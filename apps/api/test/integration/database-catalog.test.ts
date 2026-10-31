import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Reads PostgreSQL's own catalogs, so it checks what is actually enforced rather than what the
 * migrations intended. It guards against new tables being added without tenant protection.
 */
const app = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

afterAll(() => app.$disconnect());

/** Tables with a tenant_id that deliberately do not use tenant-scoped RLS. Keep this empty. */
const RLS_EXEMPT_TENANT_TABLES: string[] = [];

/** Tables that hold no tenant data, and so need no RLS. New entries need review. */
const GLOBAL_TABLES = [
  'consumed_events',
  'password_reset_tokens',
  'permissions',
  'refresh_tokens',
  'role_permissions',
  'roles',
  'tenants',
  'user_credentials',
  'user_mfa_factors',
  'user_profiles',
  'user_sessions',
  'users',
];

interface TableSecurity {
  table: string;
  has_tenant_id: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: bigint;
}

async function tableSecurity(): Promise<TableSecurity[]> {
  return app.$queryRaw<TableSecurity[]>`
    SELECT c.relname AS table,
      EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      ) AS has_tenant_id,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`;
}

describe('runtime database role', () => {
  it('cannot bypass row-level security', async () => {
    const [role] = await app.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({
      rolname: 'impulse_app',
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
    });
  });

  it('owns no tables, since owners can disable RLS', async () => {
    const [{ owned }] = (await app.$queryRaw`
      SELECT count(*) AS owned FROM pg_tables WHERE tableowner = current_user`) as [
      { owned: bigint },
    ];
    expect(Number(owned)).toBe(0);
  });

  it('cannot read the migration history', async () => {
    await expect(app.$queryRaw`SELECT 1 FROM _prisma_migrations`).rejects.toThrow();
  });
});

describe('row-level security coverage', () => {
  it('is enabled, forced and has policies on every table with a tenant_id', async () => {
    const unprotected = (await tableSecurity())
      .filter((t) => t.has_tenant_id && !RLS_EXEMPT_TENANT_TABLES.includes(t.table))
      .filter((t) => !t.rls_enabled || !t.rls_forced || Number(t.policy_count) === 0)
      .map((t) => t.table);
    expect(unprotected).toEqual([]);
  });

  it('classifies every table without a tenant_id as deliberately global', async () => {
    const unclassified = (await tableSecurity())
      .filter((t) => !t.has_tenant_id && !GLOBAL_TABLES.includes(t.table))
      .map((t) => t.table);
    expect(unclassified).toEqual([]);
  });

  it('fails closed: tenant rows are invisible with no tenant context', async () => {
    // Runs outside TenantDatabase.run on purpose, so no context is set on this connection.
    await expect(app.childProfile.count()).resolves.toBe(0);
    await expect(app.organization.count()).resolves.toBe(0);
    await expect(app.organizationMember.count()).resolves.toBe(0);
  });
});

describe('append-only tables', () => {
  async function privileges(table: string, role: string) {
    const [row] = await app.$queryRaw<{ can_update: boolean; can_delete: boolean }[]>`
      SELECT has_table_privilege(${role}::name, ${table}::text, 'UPDATE') AS can_update,
             has_table_privilege(${role}::name, ${table}::text, 'DELETE') AS can_delete`;
    return row;
  }

  it.each(['impulse_app', 'impulse_system'])(
    '%s cannot alter or remove audit rows',
    async (role) => {
      expect(await privileges('audit_logs', role)).toEqual({
        can_update: false,
        can_delete: false,
      });
    },
  );

  it.each(['impulse_app', 'impulse_system'])('%s cannot delete consent history', async (role) => {
    expect((await privileges('child_consents', role))?.can_delete).toBe(false);
  });

  it('limits consent updates to the revocation columns', async () => {
    const rows = await app.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE table_name = 'child_consents' AND grantee = 'impulse_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(rows.map((row) => row.column_name)).toEqual(['revoked_at', 'revoked_by']);
  });

  it('lets the runtime role write events but not read them', async () => {
    await expect(app.$queryRaw`SELECT 1 FROM outbox_events LIMIT 1`).rejects.toThrow();
  });
});
