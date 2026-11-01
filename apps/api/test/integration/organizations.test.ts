import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuthResult,
  type ChildView,
  type ConsentView,
  ERROR_CODES,
  type MemberView,
  type OrganizationView,
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
const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;
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

describe('invitation email', () => {
  it('is written in the inviter’s language, names the school and links to the accept page', async () => {
    const school = await createSchool();
    await system.client.user.update({ where: { id: school.owner.userId }, data: { locale: 'ru' } });
    const invitee = await registerAdult(ctx, 'Invitee');
    await ctx
      .http()
      .post(url('/organizations/invitations'))
      .set(bearer(school.token))
      .send({ email: invitee.email, role: 'TEACHER', organizationId: school.root.id })
      .expect(201);

    const mail = await ctx.email.waitFor(invitee.email);
    expect(mail.subject).toContain('Bright Future School');
    expect(mail.text).toContain('Вас пригласили');
    const code = tokenFrom(mail.text);
    expect(mail.text).toContain(`/invitations/accept?code=${encodeURIComponent(code)}`);
  });
});

describe('pending invitations', () => {
  async function invite(school: Awaited<ReturnType<typeof createSchool>>, email: string) {
    return dataOf<{ id: string }>(
      await ctx
        .http()
        .post(url('/organizations/invitations'))
        .set(bearer(school.token))
        .send({ email, role: 'TEACHER', organizationId: school.root.id })
        .expect(201),
    );
  }

  it('lists invitations until they are accepted or cancelled', async () => {
    const school = await createSchool();
    const invitee = await registerAdult(ctx, 'Invitee');
    const sent = await invite(school, invitee.email);
    const list = async () =>
      dataOf<{ id: string; email: string }[]>(
        await ctx
          .http()
          .get(url('/organizations/invitations'))
          .set(bearer(school.token))
          .expect(200),
      );
    expect((await list()).map((entry) => entry.id)).toEqual([sent.id]);

    await ctx
      .http()
      .delete(url(`/organizations/invitations/${sent.id}`))
      .set(bearer(school.token))
      .expect(204);
    expect(await list()).toEqual([]);
  });

  it('refuses a cancelled code', async () => {
    const school = await createSchool();
    const invitee = await registerAdult(ctx, 'Invitee');
    const sent = await invite(school, invitee.email);
    const code = tokenFrom((await ctx.email.waitFor(invitee.email)).text);
    await ctx
      .http()
      .delete(url(`/organizations/invitations/${sent.id}`))
      .set(bearer(school.token))
      .expect(204);
    const response = await ctx
      .http()
      .post(url('/invitations/accept'))
      .set(bearer(invitee.accessToken))
      .send({ token: code })
      .expect(400);
    expect(errorCode(response)).toBe(ERROR_CODES.INVITATION_INVALID);
  });

  it('cannot be seen or cancelled from another school, or by a teacher', async () => {
    const school = await createSchool();
    const other = await createSchool();
    const sent = await invite(school, `pending-${Date.now()}@example.test`);
    await ctx
      .http()
      .delete(url(`/organizations/invitations/${sent.id}`))
      .set(bearer(other.token))
      .expect(404);
    const otherList = await ctx
      .http()
      .get(url('/organizations/invitations'))
      .set(bearer(other.token))
      .expect(200);
    expect(dataOf<unknown[]>(otherList)).toEqual([]);

    const teacher = await joinAs(school, 'TEACHER');
    await ctx.http().get(url('/organizations/invitations')).set(bearer(teacher.token)).expect(403);
    await ctx
      .http()
      .delete(url(`/organizations/invitations/${sent.id}`))
      .set(bearer(teacher.token))
      .expect(403);
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

  it('lists only this school’s members, not the viewer’s memberships elsewhere', async () => {
    const school = await createSchool();
    const members = dataOf<MemberView[]>(
      await ctx.http().get(url('/organizations/members')).set(bearer(school.token)).expect(200),
    );
    // The owner also belongs to their family tenant, which must not appear here.
    expect(members.filter((m) => m.userId === school.owner.userId)).toHaveLength(1);
    expect(members.every((m) => m.organizationId === school.root.id)).toBe(true);
  });

  it('refuses to remove the only owner', async () => {
    const school = await createSchool();
    const response = await ctx
      .http()
      .delete(url(`/organizations/members/${school.owner.userId}`))
      .set(bearer(school.token))
      .expect(409);
    expect(errorCode(response)).toBe(ERROR_CODES.LAST_OWNER);
  });

  it('removes a member, who then loses access to the school', async () => {
    const school = await createSchool();
    const teacher = await joinAs(school, 'TEACHER');
    await ctx
      .http()
      .delete(url(`/organizations/members/${teacher.adult.userId}`))
      .set(bearer(school.token))
      .expect(204);
    // A school request is refused, never run against another tenant instead.
    await ctx.http().get(url('/organizations/units')).set(bearer(teacher.token)).expect(403);

    // But the account still works: the session moves back to a tenant they belong to.
    const session = dataOf<AuthResult>(
      await ctx.http().get(url('/auth/session')).set(bearer(teacher.token)).expect(200),
    );
    expect(session.activeTenantId).toBe(teacher.adult.tenantId);
    expect(session.tenants.map((tenant) => tenant.tenantId)).not.toContain(school.tenantId);
    await ctx.http().post(url('/auth/logout')).set(bearer(teacher.token)).expect(204);
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
