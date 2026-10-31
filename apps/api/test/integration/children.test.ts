import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuthResult,
  type ChildSettings,
  type ChildView,
  type ConsentView,
  ERROR_CODES,
  type GuardianView,
} from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import {
  CHILD_PASSCODE,
  childPayload,
  createTestApp,
  dataOf,
  registerAdult,
  type RegisteredAdult,
  type TestApp,
  unique,
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
const auth = (adult: RegisteredAdult) => bearer(adult.accessToken);
const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;

async function createChild(parent: RegisteredAdult, overrides: Record<string, unknown> = {}) {
  const payload = childPayload(overrides);
  const response = await ctx
    .http()
    .post(url('/children'))
    .set(auth(parent))
    .send(payload)
    .expect(201);
  return { child: dataOf<ChildView>(response), payload };
}

function childLogin(loginCode: string, username: string, passcode = CHILD_PASSCODE) {
  return ctx
    .http()
    .post(url('/auth/child/login'))
    .send({ loginCode, username, passcode, transport: 'bearer' });
}

async function childSession(parent: RegisteredAdult, username: string) {
  const response = await childLogin(parent.loginCode, username).expect(200);
  return dataOf<AuthResult>(response);
}

describe('provisioning a child', () => {
  it('needs no email, and links the provisioning parent as guardian', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);

    const profile = await system.client.childProfile.findUniqueOrThrow({
      where: { id: child.id },
      include: { user: true, links: { include: { parent: true } } },
    });
    expect(profile.user.email).toBeNull();
    expect(profile.user.kind).toBe('CHILD');
    expect(profile.links.map((link) => link.parent.userId)).toEqual([parent.userId]);
  });

  it('records the policy version and scopes the guardian agreed to', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const consents = dataOf<ConsentView[]>(
      await ctx
        .http()
        .get(url(`/children/${child.id}/consents`))
        .set(auth(parent))
        .expect(200),
    );
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      policyVersion: '2026-10',
      scopes: ['ACCOUNT_ACCESS', 'LEARNING_ANALYTICS'],
      basis: 'PARENTAL',
      revokedAt: null,
    });
  });

  it('cannot be done without account access consent', async () => {
    const parent = await registerAdult(ctx);
    await ctx
      .http()
      .post(url('/children'))
      .set(auth(parent))
      .send(childPayload({ consent: { policyVersion: '2026-10', scopes: ['AI_ASSISTANCE'] } }))
      .expect(400);
  });

  it('defaults every optional feature to off, except notifications', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    expect(child.settings).toEqual({
      dailyMinutesLimit: null,
      aiTutorEnabled: false,
      leaderboardsEnabled: false,
      notificationsEnabled: true,
    });
  });

  it('rejects a duplicate username in the same tenant', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    const response = await ctx
      .http()
      .post(url('/children'))
      .set(auth(parent))
      .send(childPayload({ username: payload.username }))
      .expect(409);
    expect(errorCode(response)).toBe(ERROR_CODES.USERNAME_TAKEN);
  });

  it('allows the same username in a different tenant', async () => {
    const username = unique('samename');
    await createChild(await registerAdult(ctx), { username });
    await createChild(await registerAdult(ctx), { username });
  });

  it('keeps no personal data in the audit log or events', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent, { displayName: 'Distinctive Name' });
    const [audit, events] = await Promise.all([
      system.client.auditLog.findMany({ where: { tenantId: parent.tenantId } }),
      system.client.outboxEvent.findMany({ where: { tenantId: parent.tenantId } }),
    ]);
    const stored = JSON.stringify([audit, events]);
    expect(stored).not.toContain('Distinctive Name');
    expect(stored).not.toContain(payload.username);
  });
});

describe('child sign-in', () => {
  it('works with the family code, username and passcode', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    const session = await childSession(parent, payload.username);
    expect(session.user.kind).toBe('CHILD');
    expect(session.permissions.sort()).toEqual([
      'student.learn',
      'student.play',
      'student.view_own_progress',
    ]);
  });

  it('accepts the code in any case, since children type it by hand', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    await childLogin(parent.loginCode.toLowerCase(), payload.username.toUpperCase()).expect(200);
  });

  it('gives one answer for a wrong passcode, username or code', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    const wrongPasscode = await childLogin(parent.loginCode, payload.username, 'wrong-pass').expect(
      401,
    );
    const wrongUser = await childLogin(parent.loginCode, unique('ghost')).expect(401);
    const wrongCode = await childLogin('NOSUCHCODE', payload.username).expect(401);
    expect(wrongPasscode.body.error).toEqual(wrongUser.body.error);
    expect(wrongUser.body.error).toEqual(wrongCode.body.error);
  });

  it('cannot sign in with the correct passcode under another tenant code', async () => {
    const parent = await registerAdult(ctx);
    const other = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    await childLogin(other.loginCode, payload.username).expect(401);
  });

  it('locks after repeated failures, which makes short passcodes safe to guess-limit', async () => {
    const parent = await registerAdult(ctx);
    const { payload } = await createChild(parent);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await childLogin(parent.loginCode, payload.username, 'wrong-pass').expect(401);
    }
    const locked = await childLogin(parent.loginCode, payload.username).expect(429);
    expect(errorCode(locked)).toBe(ERROR_CODES.ACCOUNT_LOCKED);
  });
});

describe('what a child cannot do', () => {
  async function signedInChild() {
    const parent = await registerAdult(ctx);
    const { child, payload } = await createChild(parent);
    const sibling = await createChild(parent);
    const session = await childSession(parent, payload.username);
    return { parent, child, sibling: sibling.child, token: session.accessToken as string };
  }

  it('can read their own profile', async () => {
    const { child, token } = await signedInChild();
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(bearer(token))
      .expect(200);
  });

  it("cannot see a sibling's profile", async () => {
    const { sibling, token } = await signedInChild();
    await ctx
      .http()
      .get(url(`/children/${sibling.id}`))
      .set(bearer(token))
      .expect(404);
  });

  it('cannot create another child', async () => {
    const { token } = await signedInChild();
    await ctx.http().post(url('/children')).set(bearer(token)).send(childPayload()).expect(403);
  });

  it('cannot change their own settings', async () => {
    const { child, token } = await signedInChild();
    await ctx
      .http()
      .patch(url(`/children/${child.id}/settings`))
      .set(bearer(token))
      .send({ leaderboardsEnabled: true })
      .expect(403);
  });

  it('cannot view or change consent', async () => {
    const { child, token } = await signedInChild();
    await ctx
      .http()
      .get(url(`/children/${child.id}/consents`))
      .set(bearer(token))
      .expect(403);
    await ctx
      .http()
      .post(url(`/children/${child.id}/consents`))
      .set(bearer(token))
      .send({ policyVersion: '1', scopes: ['AI_ASSISTANCE'] })
      .expect(403);
  });

  it('cannot create an organization or enroll in MFA', async () => {
    const { token } = await signedInChild();
    await ctx
      .http()
      .post(url('/organizations'))
      .set(bearer(token))
      .send({ name: 'Kid Corp', kind: 'LEARNING_CENTER' })
      .expect(403);
    await ctx.http().post(url('/auth/mfa/enroll')).set(bearer(token)).expect(403);
  });
});

describe('parent settings', () => {
  it('lets a linked parent update settings, and audits it', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const settings = dataOf<ChildSettings>(
      await ctx
        .http()
        .patch(url(`/children/${child.id}/settings`))
        .set(auth(parent))
        .send({ dailyMinutesLimit: 45, aiTutorEnabled: true })
        .expect(200),
    );
    expect(settings).toMatchObject({ dailyMinutesLimit: 45, aiTutorEnabled: true });
    const audited = await system.client.auditLog.count({
      where: { action: 'child.settings_updated', targetId: child.id },
    });
    expect(audited).toBe(1);
  });

  it('rejects an out-of-range limit', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    await ctx
      .http()
      .patch(url(`/children/${child.id}/settings`))
      .set(auth(parent))
      .send({ dailyMinutesLimit: 100000 })
      .expect(400);
  });
});

describe('consent lifecycle', () => {
  async function consentId(parent: RegisteredAdult, childId: string) {
    const list = dataOf<ConsentView[]>(
      await ctx
        .http()
        .get(url(`/children/${childId}/consents`))
        .set(auth(parent))
        .expect(200),
    );
    return (list[0] as ConsentView).id;
  }

  it('ends active sessions at once, and blocks further sign-in', async () => {
    const parent = await registerAdult(ctx);
    const { child, payload } = await createChild(parent);
    const session = await childSession(parent, payload.username);
    const headers = bearer(session.accessToken as string);
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(headers)
      .expect(200);

    await ctx
      .http()
      .delete(url(`/children/${child.id}/consents/${await consentId(parent, child.id)}`))
      .set(auth(parent))
      .expect(204);

    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(headers)
      .expect(401);
    const blocked = await childLogin(parent.loginCode, payload.username).expect(403);
    expect(errorCode(blocked)).toBe(ERROR_CODES.CONSENT_REQUIRED);
  });

  it('hides consent status from anyone without the passcode', async () => {
    const parent = await registerAdult(ctx);
    const { child, payload } = await createChild(parent);
    await ctx
      .http()
      .delete(url(`/children/${child.id}/consents/${await consentId(parent, child.id)}`))
      .set(auth(parent))
      .expect(204);
    await childLogin(parent.loginCode, payload.username, 'wrong-pass').expect(401);
  });

  it('keeps the revoked record, and lets a guardian grant again', async () => {
    const parent = await registerAdult(ctx);
    const { child, payload } = await createChild(parent);
    await ctx
      .http()
      .delete(url(`/children/${child.id}/consents/${await consentId(parent, child.id)}`))
      .set(auth(parent))
      .expect(204);
    await ctx
      .http()
      .post(url(`/children/${child.id}/consents`))
      .set(auth(parent))
      .send({ policyVersion: '2026-11', scopes: ['ACCOUNT_ACCESS'] })
      .expect(201);

    const history = dataOf<ConsentView[]>(
      await ctx
        .http()
        .get(url(`/children/${child.id}/consents`))
        .set(auth(parent))
        .expect(200),
    );
    expect(history).toHaveLength(2);
    expect(history.filter((consent) => consent.revokedAt !== null)).toHaveLength(1);
    await childLogin(parent.loginCode, payload.username).expect(200);
  });

  it('leaves sessions alone when a non-essential scope is withdrawn', async () => {
    const parent = await registerAdult(ctx);
    const { child, payload } = await createChild(parent);
    const extra = dataOf<ConsentView>(
      await ctx
        .http()
        .post(url(`/children/${child.id}/consents`))
        .set(auth(parent))
        .send({ policyVersion: '2026-10', scopes: ['AI_ASSISTANCE'] })
        .expect(201),
    );
    const session = await childSession(parent, payload.username);
    await ctx
      .http()
      .delete(url(`/children/${child.id}/consents/${extra.id}`))
      .set(auth(parent))
      .expect(204);
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(bearer(session.accessToken as string))
      .expect(200);
  });
});

describe('guardians', () => {
  const tokenFrom = (text: string) => /([0-9a-f-]{36}\.[\w-]+)/.exec(text)?.[1] as string;

  async function inviteSecondGuardian(parent: RegisteredAdult, childId: string) {
    const guardian = await registerAdult(ctx, 'Second Guardian');
    await ctx
      .http()
      .post(url(`/children/${childId}/guardians`))
      .set(auth(parent))
      .send({ email: guardian.email, relationship: 'aunt' })
      .expect(201);
    const token = tokenFrom((await ctx.email.waitFor(guardian.email)).text);
    return { guardian, token };
  }

  const accept = (guardian: RegisteredAdult, token: string) =>
    ctx.http().post(url('/invitations/accept')).set(auth(guardian)).send({ token });

  it('supports several guardians through an invitation', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, child.id);
    await accept(guardian, token).expect(200);

    const list = dataOf<GuardianView[]>(
      await ctx
        .http()
        .get(url(`/children/${child.id}/guardians`))
        .set(auth(parent))
        .expect(200),
    );
    expect(list.map((entry) => entry.userId).sort()).toEqual(
      [parent.userId, guardian.userId].sort(),
    );
    expect(list.find((entry) => entry.userId === guardian.userId)?.relationship).toBe('aunt');
  });

  it('gives the new guardian access to that child in the tenant', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, child.id);
    await accept(guardian, token).expect(200);

    const switched = dataOf<AuthResult>(
      await ctx
        .http()
        .post(url('/auth/switch-tenant'))
        .set(auth(guardian))
        .send({ tenantId: parent.tenantId })
        .expect(200),
    );
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(bearer(switched.accessToken as string))
      .expect(200);
  });

  it('does not let another account use a leaked invitation', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { token } = await inviteSecondGuardian(parent, child.id);
    const thief = await registerAdult(ctx, 'Thief');
    const response = await accept(thief, token).expect(400);
    expect(errorCode(response)).toBe(ERROR_CODES.INVITATION_INVALID);
  });

  it('accepts an invitation only once', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, child.id);
    await accept(guardian, token).expect(200);
    await accept(guardian, token).expect(400);
  });

  it('refuses an expired invitation', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, child.id);
    await system.client.organizationInvitation.updateMany({
      where: { tenantId: parent.tenantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await accept(guardian, token).expect(400);
  });

  it('refuses to remove the last guardian', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const response = await ctx
      .http()
      .delete(url(`/children/${child.id}/guardians/${parent.userId}`))
      .set(auth(parent))
      .expect(409);
    expect(errorCode(response)).toBe(ERROR_CODES.LAST_GUARDIAN);
  });

  it('removes a second guardian, which ends their access to the child', async () => {
    const parent = await registerAdult(ctx);
    const { child } = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, child.id);
    await accept(guardian, token).expect(200);
    await ctx
      .http()
      .delete(url(`/children/${child.id}/guardians/${guardian.userId}`))
      .set(auth(parent))
      .expect(204);

    const switched = dataOf<AuthResult>(
      await ctx
        .http()
        .post(url('/auth/switch-tenant'))
        .set(auth(guardian))
        .send({ tenantId: parent.tenantId })
        .expect(200),
    );
    await ctx
      .http()
      .get(url(`/children/${child.id}`))
      .set(bearer(switched.accessToken as string))
      .expect(404);
  });

  it('does not expose an unlinked child to another parent in the same tenant', async () => {
    const parent = await registerAdult(ctx);
    const linked = await createChild(parent);
    const unlinked = await createChild(parent);
    const { guardian, token } = await inviteSecondGuardian(parent, linked.child.id);
    await accept(guardian, token).expect(200);
    const switched = dataOf<AuthResult>(
      await ctx
        .http()
        .post(url('/auth/switch-tenant'))
        .set(auth(guardian))
        .send({ tenantId: parent.tenantId })
        .expect(200),
    );
    await ctx
      .http()
      .get(url(`/children/${unlinked.child.id}`))
      .set(bearer(switched.accessToken as string))
      .expect(404);
    const list = dataOf<ChildView[]>(
      await ctx
        .http()
        .get(url('/children'))
        .set(bearer(switched.accessToken as string))
        .expect(200),
    );
    expect(list.map((child) => child.id)).toEqual([linked.child.id]);
  });
});
