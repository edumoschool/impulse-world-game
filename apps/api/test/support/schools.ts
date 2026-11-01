import type { AuthResult, OrganizationView } from '@impulse/contracts';
import { dataOf, registerAdult, type RegisteredAdult, type TestApp, url } from './test-app.js';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export const invitationTokenFrom = (text: string) =>
  /([0-9a-f-]{36}\.[\w-]+)/.exec(text)?.[1] as string;

export interface School {
  owner: RegisteredAdult;
  tenantId: string;
  /** The owner's bearer token, switched into the school. */
  token: string;
  root: OrganizationView;
}

/** An institution owner, switched into the new school tenant. */
export async function createSchool(ctx: TestApp, name = 'Bright Future School'): Promise<School> {
  const owner = await registerAdult(ctx, 'Principal');
  const created = await ctx
    .http()
    .post(url('/organizations'))
    .set(bearer(owner.accessToken))
    .send({ name, kind: 'PRIVATE_SCHOOL' })
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

/** A new adult invited with a role, who accepts and switches into the school. */
export async function joinAs(
  ctx: TestApp,
  school: School,
  role: string,
): Promise<{ adult: RegisteredAdult; token: string }> {
  const adult = await registerAdult(ctx, role);
  await ctx
    .http()
    .post(url('/organizations/invitations'))
    .set(bearer(school.token))
    .send({ email: adult.email, role, organizationId: school.root.id })
    .expect(201);
  const invitation = invitationTokenFrom((await ctx.email.waitFor(adult.email)).text);
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
