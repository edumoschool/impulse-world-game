import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthResult,
  ChildView,
  ConsentView,
  MemberView,
  OrganizationView,
} from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import {
  childPayload,
  createTestApp,
  dataOf,
  registerAdult,
  type RegisteredAdult,
  type TestApp,
  url,
} from '../support/test-app.js';

let ctx: TestApp;
let system: SystemDatabase;

beforeAll(async () => {
  ctx = await createTestApp();
  system = ctx.app.get(SystemDatabase);
});
afterAll(() => ctx.close());

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenFrom = (text: string) => /([0-9a-f-]{36}\.[\w-]+)/.exec(text)?.[1] as string;

/** An institution owner, switched into the new school tenant. */
async function createSchool() {
  const owner = await registerAdult(ctx, 'Principal');
  const created = await ctx
    .http()
    .post(url('/organizations'))
    .set(bearer(owner.accessToken))
    .send({ name: 'Bright Future School', kind: 'PRIVATE_SCHOOL' })
    .expect(201);
  const { tenantId } = dataOf<{ tenantId: string }>(created);
  const switched = dataOf<AuthResult>(
    await ctx
      .http()
      .post(url('/auth/switch-tenant'))
      .set(bearer(owner.accessToken))
      .send({ tenantId })
      .expect(200),
  );
  const token = switched.accessToken as string;
  const units = dataOf<OrganizationView[]>(
    await ctx.http().get(url('/organizations/units')).set(bearer(token)).expect(200),
  );
  return { owner, tenantId, token, root: units[0] as OrganizationView };
}

async function joinAs(
  school: { token: string; root: OrganizationView; tenantId: string },
  role: string,
): Promise<{ adult: RegisteredAdult; token: string }> {
  const adult = await registerAdult(ctx, role);
  await ctx
    .http()
    .post(url('/organizations/invitations'))
    .set(bearer(school.token))
    .send({ email: adult.email, role, organizationId: school.root.id })
    .expect(201);
  const invitation = tokenFrom((await ctx.email.waitFor(adult.email)).text);
  await ctx
    .http()
    .post(url('/invitations/accept'))
    .set(bearer(adult.accessToken))
    .send({ token: invitation })
    .expect(200);
  const switched = dataOf<AuthResult>(
    await ctx
      .http()
      .post(url('/auth/switch-tenant'))
      .set(bearer(adult.accessToken))
      .send({ tenantId: school.tenantId })
      .expect(200),
  );
  return { adult, token: switched.accessToken as string };
}

describe('institution setup', () => {
  it('makes the creator owner and school admin of a new tenant', async () => {
    const school = await createSchool();
    const session = dataOf<AuthResult>(
      await ctx.http().get(url('/auth/session')).set(bearer(school.token)).expect(200),
    );
    expect(session.permissions).toEqual(
      expect.arrayContaining(['organization.manage_billing', 'children.provision']),
    );
  });

  it('builds a tree of branches and departments', async () => {
    const school = await createSchool();
    const branch = dataOf<OrganizationView>(
      await ctx
        .http()
        .post(url('/organizations/units'))
        .set(bearer(school.token))
        .send({ name: 'North Campus', kind: 'BRANCH', parentId: school.root.id })
        .expect(201),
    );
    await ctx
      .http()
      .post(url('/organizations/units'))
      .set(bearer(school.token))
      .send({ name: 'Mathematics', kind: 'DEPARTMENT', parentId: branch.id })
      .expect(201);

    const units = dataOf<OrganizationView[]>(
      await ctx.http().get(url('/organizations/units')).set(bearer(school.token)).expect(200),
    );
    expect(units.map((unit) => unit.kind)).toEqual(['ROOT', 'BRANCH', 'DEPARTMENT']);
  });

  it('refuses a branch under a branch', async () => {
    const school = await createSchool();
    const branch = dataOf<OrganizationView>(
      await ctx
        .http()
        .post(url('/organizations/units'))
        .set(bearer(school.token))
        .send({ name: 'North Campus', kind: 'BRANCH', parentId: school.root.id })
        .expect(201),
    );
    await ctx
      .http()
      .post(url('/organizations/units'))
      .set(bearer(school.token))
      .send({ name: 'Nested', kind: 'BRANCH', parentId: branch.id })
      .expect(409);
  });
});

describe('roles inside a school', () => {
  it('lets a school admin provision a child under the school basis, with no guardian link', async () => {
    const school = await createSchool();
    const response = await ctx
      .http()
      .post(url('/children'))
      .set(bearer(school.token))
      .send(childPayload())
      .expect(201);
    const child = dataOf<ChildView>(response);

    const consents = dataOf<ConsentView[]>(
      await ctx
        .http()
        .get(url(`/children/${child.id}/consents`))
        .set(bearer(school.token))
        .expect(200),
    );
    expect(consents[0]?.basis).toBe('SCHOOL_AUTHORIZED');
    const links = await system.client.parentChildLink.count({ where: { childId: child.id } });
    expect(links).toBe(0);
  });

  it('gives a teacher no route to any child by role alone', async () => {
    const school = await createSchool();
    const child = dataOf<ChildView>(
      await ctx
        .http()
        .post(url('/children'))
        .set(bearer(school.token))
        .send(childPayload())
        .expect(201),
    );
    const teacher = await joinAs(school, 'TEACHER');
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(bearer(teacher.token))
      .expect(404);
    const list = dataOf<ChildView[]>(
      await ctx.http().get(url('/children')).set(bearer(teacher.token)).expect(200),
    );
    expect(list).toEqual([]);
  });

  it('stops a teacher managing members or structure', async () => {
    const school = await createSchool();
    const teacher = await joinAs(school, 'TEACHER');
    await ctx.http().get(url('/organizations/members')).set(bearer(teacher.token)).expect(403);
    await ctx
      .http()
      .post(url('/organizations/units'))
      .set(bearer(teacher.token))
      .send({ name: 'Rogue', kind: 'BRANCH', parentId: school.root.id })
      .expect(403);
    await ctx.http().get(url('/audit-logs')).set(bearer(teacher.token)).expect(403);
  });

  it('cannot be used to invite someone to a platform role', async () => {
    const school = await createSchool();
    await ctx
      .http()
      .post(url('/organizations/invitations'))
      .set(bearer(school.token))
      .send({ email: 'x@example.test', role: 'PLATFORM_ADMIN', organizationId: school.root.id })
      .expect(400);
    await ctx
      .http()
      .post(url('/organizations/invitations'))
      .set(bearer(school.token))
      .send({
        email: 'x@example.test',
        role: 'ORGANIZATION_OWNER',
        organizationId: school.root.id,
      })
      .expect(400);
  });
});

describe('members', () => {
  it('lists members with their roles', async () => {
    const school = await createSchool();
    const teacher = await joinAs(school, 'TEACHER');
    const members = dataOf<MemberView[]>(
      await ctx.http().get(url('/organizations/members')).set(bearer(school.token)).expect(200),
    );
    expect(members.find((m) => m.userId === teacher.adult.userId)?.roles).toEqual(['TEACHER']);
    expect(members.find((m) => m.userId === school.owner.userId)?.roles.sort()).toEqual([
      'ORGANIZATION_OWNER',
      'SCHOOL_ADMIN',
    ]);
  });

  it('refuses to remove the only owner', async () => {
    const school = await createSchool();
    await ctx
      .http()
      .delete(url(`/organizations/members/${school.owner.userId}`))
      .set(bearer(school.token))
      .expect(409);
  });
});

describe('platform role grants', () => {
  it('apply alongside the active tenant, without needing membership of it', async () => {
    const adult = await registerAdult(ctx);
    const admin = await system.client.role.findUniqueOrThrow({ where: { key: 'PLATFORM_ADMIN' } });
    await system.client.userRole.create({ data: { userId: adult.userId, roleId: admin.id } });

    const session = dataOf<AuthResult>(
      await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken)).expect(200),
    );
    expect(session.permissions).toContain('platform.manage_users');
  });
});
