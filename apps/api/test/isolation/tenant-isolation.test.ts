import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResult, ChildView, ConsentView, OrganizationView } from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { TenantDatabase } from '../../src/infrastructure/database/tenant-database.js';
import {
  childPayload,
  createTestApp,
  dataOf,
  registerAdult,
  type RegisteredAdult,
  type TestApp,
  url,
} from '../support/test-app.js';

/**
 * The dedicated isolation suite required by spec 6.2. Each test sets up two tenants and attacks
 * one from the other. The HTTP section proves the application layer. The RLS section goes around
 * the application and proves the database refuses on its own.
 */
let ctx: TestApp;
let database: TenantDatabase;
let system: SystemDatabase;
let alice: RegisteredAdult;
let bob: RegisteredAdult;
let aliceChild: ChildView;
let bobChild: ChildView;

const bearer = (adult: RegisteredAdult) => ({ Authorization: `Bearer ${adult.accessToken}` });

beforeAll(async () => {
  ctx = await createTestApp();
  database = ctx.app.get(TenantDatabase);
  system = ctx.app.get(SystemDatabase);
  alice = await registerAdult(ctx, 'Alice');
  bob = await registerAdult(ctx, 'Bob');
  aliceChild = dataOf<ChildView>(
    await ctx.http().post(url('/children')).set(bearer(alice)).send(childPayload()).expect(201),
  );
  bobChild = dataOf<ChildView>(
    await ctx.http().post(url('/children')).set(bearer(bob)).send(childPayload()).expect(201),
  );
});
afterAll(() => ctx.close());

describe('through the API', () => {
  it("does not list another tenant's children", async () => {
    const list = dataOf<ChildView[]>(
      await ctx.http().get(url('/children')).set(bearer(alice)).expect(200),
    );
    expect(list.map((child) => child.id)).toEqual([aliceChild.id]);
  });

  it.each([
    ['get', (id: string) => `/children/${id}`],
    ['get', (id: string) => `/children/${id}/consents`],
    ['get', (id: string) => `/children/${id}/guardians`],
  ] as const)("hides another tenant's child on %s %s", async (_method, path) => {
    await ctx
      .http()
      .get(url(path(bobChild.id)))
      .set(bearer(alice))
      .expect(404);
  });

  it("cannot change another tenant's child settings", async () => {
    await ctx
      .http()
      .patch(url(`/children/${bobChild.id}/settings`))
      .set(bearer(alice))
      .send({ aiTutorEnabled: true })
      .expect(404);
  });

  it("cannot revoke another tenant's consent", async () => {
    const consents = await system.client.childConsent.findMany({
      where: { childId: bobChild.id },
    });
    await ctx
      .http()
      .delete(url(`/children/${bobChild.id}/consents/${consents[0]?.id}`))
      .set(bearer(alice))
      .expect(404);
    const after = await system.client.childConsent.findFirstOrThrow({
      where: { childId: bobChild.id },
    });
    expect(after.revokedAt).toBeNull();
  });

  it("cannot invite a guardian to another tenant's child", async () => {
    await ctx
      .http()
      .post(url(`/children/${bobChild.id}/guardians`))
      .set(bearer(alice))
      .send({ email: 'intruder@example.test' })
      .expect(404);
  });

  it("cannot add a branch under another tenant's organization", async () => {
    const bobRoot = await system.client.organization.findFirstOrThrow({
      where: { tenantId: bob.tenantId, kind: 'ROOT' },
    });
    await ctx
      .http()
      .post(url('/organizations/units'))
      .set(bearer(alice))
      .send({ name: 'Intruder Branch', kind: 'BRANCH', parentId: bobRoot.id })
      .expect(404);
  });

  it("cannot read another tenant's audit log", async () => {
    const response = await ctx.http().get(url('/audit-logs')).set(bearer(alice)).expect(200);
    const rows = dataOf<{ tenantId: string }[]>(response);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.tenantId === alice.tenantId)).toBe(true);
  });

  it('ignores a tenant id smuggled into a request', async () => {
    const created = await ctx
      .http()
      .post(url('/children'))
      .set(bearer(alice))
      .send(childPayload({ tenantId: bob.tenantId }))
      .expect(201);
    const row = await system.client.childProfile.findUniqueOrThrow({
      where: { id: dataOf<ChildView>(created).id },
    });
    expect(row.tenantId).toBe(alice.tenantId);
  });

  it('ignores a tenant id smuggled into a header', async () => {
    const list = dataOf<ChildView[]>(
      await ctx
        .http()
        .get(url('/children'))
        .set(bearer(alice))
        .set('X-Tenant-Id', bob.tenantId)
        .expect(200),
    );
    expect(list.map((child) => child.id)).not.toContain(bobChild.id);
  });
});

describe('tenant switching', () => {
  it('refuses a tenant the user is not a member of', async () => {
    await ctx
      .http()
      .post(url('/auth/switch-tenant'))
      .set(bearer(alice))
      .send({ tenantId: bob.tenantId })
      .expect(404);
  });

  it('gives the same answer for a tenant that does not exist', async () => {
    await ctx
      .http()
      .post(url('/auth/switch-tenant'))
      .set(bearer(alice))
      .send({ tenantId: randomUUID() })
      .expect(404);
  });

  it('audits the refused attempt', async () => {
    await ctx
      .http()
      .post(url('/auth/switch-tenant'))
      .set(bearer(alice))
      .send({ tenantId: bob.tenantId })
      .expect(404);
    const denied = await system.client.auditLog.count({
      where: {
        action: 'auth.switch_tenant_denied',
        actorUserId: alice.userId,
        targetId: bob.tenantId,
        outcome: 'DENIED',
      },
    });
    expect(denied).toBeGreaterThan(0);
  });

  it('moves a real multi-tenant member, and access follows the new tenant', async () => {
    const owner = await registerAdult(ctx, 'School Owner');
    const created = await ctx
      .http()
      .post(url('/organizations'))
      .set(bearer(owner))
      .send({ name: 'Sunrise School', kind: 'PRIVATE_SCHOOL' })
      .expect(201);
    const { tenantId } = dataOf<{ tenantId: string }>(created);

    const switched = dataOf<AuthResult>(
      await ctx
        .http()
        .post(url('/auth/switch-tenant'))
        .set(bearer(owner))
        .send({ tenantId })
        .expect(200),
    );
    expect(switched.activeTenantId).toBe(tenantId);
    expect(switched.tenants).toHaveLength(2);

    const units = dataOf<OrganizationView[]>(
      await ctx
        .http()
        .get(url('/organizations/units'))
        .set({ Authorization: `Bearer ${switched.accessToken}` })
        .expect(200),
    );
    expect(units.map((unit) => unit.name)).toEqual(['Sunrise School']);
  });
});

describe('membership revocation', () => {
  it('cuts access on the next request, without waiting for token expiry', async () => {
    const owner = await registerAdult(ctx, 'Owner');
    const member = await registerAdult(ctx, 'Member');
    await system.client.organizationMember.create({
      data: {
        tenantId: owner.tenantId,
        organizationId: (
          await system.client.organization.findFirstOrThrow({
            where: { tenantId: owner.tenantId },
          })
        ).id,
        userId: member.userId,
      },
    });
    const switched = dataOf<AuthResult>(
      await ctx
        .http()
        .post(url('/auth/switch-tenant'))
        .set(bearer(member))
        .send({ tenantId: owner.tenantId })
        .expect(200),
    );
    const headers = { Authorization: `Bearer ${switched.accessToken}` };
    await ctx.http().get(url('/auth/session')).set(headers).expect(200);

    await ctx
      .http()
      .delete(url(`/organizations/members/${member.userId}`))
      .set(bearer(owner))
      .expect(204);

    // The owner's tenant is closed to them on the very next request.
    await ctx.http().get(url('/organizations/units')).set(headers).expect(403);
    const after = dataOf<AuthResult>(
      await ctx.http().get(url('/auth/session')).set(headers).expect(200),
    );
    expect(after.activeTenantId).toBe(member.tenantId);
    expect(after.tenants.map((tenant) => tenant.tenantId)).not.toContain(owner.tenantId);
  });
});

describe('at the database layer, with the application bypassed', () => {
  it('returns no rows from another tenant even with no filter at all', async () => {
    const seen = await database.run({ tenantId: alice.tenantId }, (tx) =>
      tx.childProfile.findMany(),
    );
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((child) => child.tenantId === alice.tenantId)).toBe(true);
  });

  it("does not find another tenant's row by primary key", async () => {
    const found = await database.run({ tenantId: alice.tenantId }, (tx) =>
      tx.childProfile.findUnique({ where: { id: bobChild.id } }),
    );
    expect(found).toBeNull();
  });

  it("refuses to update another tenant's row", async () => {
    const { count } = await database.run({ tenantId: alice.tenantId }, (tx) =>
      tx.childProfile.updateMany({
        where: { id: bobChild.id },
        data: { displayName: 'tampered' },
      }),
    );
    expect(count).toBe(0);
  });

  it('refuses to insert a row into another tenant', async () => {
    await expect(
      database.run({ tenantId: alice.tenantId }, (tx) =>
        tx.organization.create({
          data: { tenantId: bob.tenantId, kind: 'BRANCH', name: 'Planted' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('refuses to move a row into another tenant', async () => {
    await expect(
      database.run({ tenantId: alice.tenantId }, (tx) =>
        tx.organization.updateMany({
          where: { tenantId: alice.tenantId },
          data: { tenantId: bob.tenantId },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a link that points at another tenant's child, by composite foreign key", async () => {
    const aliceProfile = await system.client.parentProfile.findFirstOrThrow({
      where: { tenantId: alice.tenantId, userId: alice.userId },
    });
    await expect(
      database.run({ tenantId: alice.tenantId }, (tx) =>
        tx.parentChildLink.create({
          data: {
            tenantId: alice.tenantId,
            childId: bobChild.id,
            parentProfileId: aliceProfile.id,
            relationship: 'parent',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('cannot grant a platform role from a tenant context', async () => {
    const admin = await system.client.role.findUniqueOrThrow({ where: { key: 'PLATFORM_ADMIN' } });
    await expect(
      database.run({ tenantId: alice.tenantId, userId: alice.userId }, (tx) =>
        tx.userRole.create({ data: { userId: alice.userId, roleId: admin.id, tenantId: null } }),
      ),
    ).rejects.toThrow();
  });

  it('hides tenant-less audit rows from the runtime role', async () => {
    const hidden = await database.run({ tenantId: alice.tenantId }, (tx) =>
      tx.auditLog.count({ where: { tenantId: null } }),
    );
    expect(hidden).toBe(0);
    await expect(
      system.client.auditLog.count({ where: { tenantId: null } }),
    ).resolves.toBeGreaterThan(0);
  });

  it('shows a user their own memberships across tenants, but nobody else in those tenants', async () => {
    const rows = await database.run({ userId: alice.userId }, (tx) =>
      tx.organizationMember.findMany(),
    );
    expect(rows.every((row) => row.userId === alice.userId)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('refuses to edit consent beyond revocation', async () => {
    const consent = (await system.client.childConsent.findFirstOrThrow({
      where: { childId: aliceChild.id },
    })) as unknown as ConsentView;
    await expect(
      database.run({ tenantId: alice.tenantId }, (tx) =>
        tx.childConsent.update({
          where: { id: consent.id },
          data: { policyVersion: 'rewritten' },
        }),
      ),
    ).rejects.toThrow();
  });
});
