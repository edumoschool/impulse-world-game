import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ERROR_CODES, type AuthResult, type SessionSummary } from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { hotp, base32Decode, totpStep } from '../../src/modules/identity/domain/totp.js';
import {
  createTestApp,
  dataOf,
  registerAdult,
  STRONG_PASSWORD,
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
const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;

function login(email: string, password = STRONG_PASSWORD, extra: Record<string, unknown> = {}) {
  return ctx
    .http()
    .post(url('/auth/login'))
    .send({ email, password, transport: 'bearer', ...extra });
}

describe('registration', () => {
  it('creates the account, family tenant, membership and owner roles in one step', async () => {
    const adult = await registerAdult(ctx);
    const tenant = await system.client.tenant.findUniqueOrThrow({
      where: { id: adult.tenantId },
      include: { organizations: true, settings: true },
    });
    expect(tenant.kind).toBe('FAMILY');
    expect(tenant.organizations).toHaveLength(1);
    expect(tenant.organizations[0]?.kind).toBe('ROOT');
    expect(tenant.settings).not.toBeNull();

    const session = await ctx
      .http()
      .get(url('/auth/session'))
      .set(bearer(adult.accessToken))
      .expect(200);
    expect(dataOf<AuthResult>(session).permissions).toEqual(
      expect.arrayContaining(['children.provision', 'organization.manage_billing']),
    );
  });

  it('never stores the password or a raw token', async () => {
    const adult = await registerAdult(ctx);
    const credential = await system.client.userCredential.findUniqueOrThrow({
      where: { userId: adult.userId },
    });
    expect(credential.passwordHash).toMatch(/^\$argon2id\$/);

    const tokens = await system.client.refreshToken.findMany({
      where: { session: { userId: adult.userId } },
    });
    expect(tokens.map((token) => token.tokenHash)).not.toContain(adult.refreshToken);
  });

  it('writes events in the same transaction, with no personal data', async () => {
    const adult = await registerAdult(ctx);
    const events = await system.client.outboxEvent.findMany({
      where: { tenantId: adult.tenantId },
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['user.created', 'tenant.created']),
    );
    expect(JSON.stringify(events)).not.toContain(adult.email);
  });

  it('rejects a duplicate email, whatever its case', async () => {
    const adult = await registerAdult(ctx);
    const response = await ctx
      .http()
      .post(url('/auth/register'))
      .send({
        email: adult.email.toUpperCase(),
        password: STRONG_PASSWORD,
        displayName: 'Copycat',
      })
      .expect(409);
    expect(errorCode(response)).toBe(ERROR_CODES.EMAIL_TAKEN);
  });

  it('leaves nothing behind when registration fails', async () => {
    const adult = await registerAdult(ctx);
    const tenantsBefore = await system.client.tenant.count();
    await ctx
      .http()
      .post(url('/auth/register'))
      .send({ email: adult.email, password: STRONG_PASSWORD, displayName: 'Copycat' })
      .expect(409);
    expect(await system.client.tenant.count()).toBe(tenantsBefore);
  });

  it('rejects a short password', async () => {
    await ctx
      .http()
      .post(url('/auth/register'))
      .send({ email: `${unique('a')}@example.test`, password: 'short', displayName: 'A' })
      .expect(400);
  });
});

describe('login', () => {
  it('returns tokens and the tenant list', async () => {
    const adult = await registerAdult(ctx);
    const result = dataOf<AuthResult>(await login(adult.email).expect(200));
    expect(result.activeTenantId).toBe(adult.tenantId);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('gives the same response for a wrong password and an unknown account', async () => {
    const adult = await registerAdult(ctx);
    const wrong = await login(adult.email, 'wrong password value').expect(401);
    const unknown = await login(`${unique('nobody')}@example.test`, 'x'.repeat(12)).expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it('locks an account after repeated failures, and also blocks the right password', async () => {
    const adult = await registerAdult(ctx);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(adult.email, 'wrong password value').expect(401);
    }
    const locked = await login(adult.email).expect(429);
    expect(errorCode(locked)).toBe(ERROR_CODES.ACCOUNT_LOCKED);
  });

  it('records failures in the audit log', async () => {
    const adult = await registerAdult(ctx);
    await login(adult.email, 'wrong password value').expect(401);
    const entries = await system.client.auditLog.count({
      where: { action: 'auth.login_failed', actorUserId: adult.userId, outcome: 'DENIED' },
    });
    expect(entries).toBe(1);
  });
});

describe('refresh token rotation', () => {
  const refresh = (refreshToken: string) =>
    ctx.http().post(url('/auth/refresh')).send({ refreshToken, transport: 'bearer' });

  it('issues a new pair and invalidates the old token', async () => {
    const adult = await registerAdult(ctx);
    const rotated = dataOf<AuthResult>(await refresh(adult.refreshToken).expect(200));
    expect(rotated.refreshToken).not.toEqual(adult.refreshToken);
    await refresh(rotated.refreshToken as string).expect(200);
  });

  it('treats reuse as theft: the whole session dies, including the newest token', async () => {
    const adult = await registerAdult(ctx);
    const rotated = dataOf<AuthResult>(await refresh(adult.refreshToken).expect(200));

    const reuse = await refresh(adult.refreshToken).expect(401);
    expect(errorCode(reuse)).toBe(ERROR_CODES.SESSION_REVOKED);

    await refresh(rotated.refreshToken as string).expect(401);
    await ctx
      .http()
      .get(url('/auth/session'))
      .set(bearer(rotated.accessToken as string))
      .expect(401);

    const audit = await system.client.auditLog.count({
      where: { action: 'auth.refresh_reuse_detected', actorUserId: adult.userId },
    });
    expect(audit).toBe(1);
  });

  it('lets only one of two concurrent refreshes succeed', async () => {
    const adult = await registerAdult(ctx);
    const results = await Promise.all([
      refresh(adult.refreshToken),
      refresh(adult.refreshToken),
      refresh(adult.refreshToken),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  });

  it('rejects an unknown token', async () => {
    await refresh('x'.repeat(43)).expect(401);
  });
});

describe('sessions', () => {
  it('stops working immediately after logout, even with an unexpired token', async () => {
    const adult = await registerAdult(ctx);
    await ctx.http().post(url('/auth/logout')).set(bearer(adult.accessToken)).expect(204);
    await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken)).expect(401);
  });

  it('lists devices and revokes one', async () => {
    const adult = await registerAdult(ctx);
    const second = dataOf<AuthResult>(
      await login(adult.email, STRONG_PASSWORD, { deviceLabel: 'Tablet' }).expect(200),
    );
    const list = dataOf<SessionSummary[]>(
      await ctx.http().get(url('/auth/sessions')).set(bearer(adult.accessToken)).expect(200),
    );
    expect(list).toHaveLength(2);

    const tablet = list.find((session) => session.deviceLabel === 'Tablet') as SessionSummary;
    await ctx
      .http()
      .delete(url(`/auth/sessions/${tablet.id}`))
      .set(bearer(adult.accessToken))
      .expect(204);
    await ctx
      .http()
      .get(url('/auth/session'))
      .set(bearer(second.accessToken as string))
      .expect(401);
    await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken)).expect(200);
  });

  it("cannot revoke someone else's session", async () => {
    const [first, second] = [await registerAdult(ctx), await registerAdult(ctx)];
    const victim = dataOf<SessionSummary[]>(
      await ctx.http().get(url('/auth/sessions')).set(bearer(second.accessToken)).expect(200),
    )[0] as SessionSummary;
    await ctx
      .http()
      .delete(url(`/auth/sessions/${victim.id}`))
      .set(bearer(first.accessToken))
      .expect(404);
  });

  it('logs out of every device', async () => {
    const adult = await registerAdult(ctx);
    const second = dataOf<AuthResult>(await login(adult.email).expect(200));
    await ctx.http().post(url('/auth/logout-all')).set(bearer(adult.accessToken)).expect(204);
    await ctx
      .http()
      .get(url('/auth/session'))
      .set(bearer(second.accessToken as string))
      .expect(401);
  });

  it('rejects a token signed with a different key', async () => {
    const forged =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsInNpZCI6Ingifo.dGhpcyBpcyBub3QgYSBzaWduYXR1cmU';
    await ctx.http().get(url('/auth/session')).set(bearer(forged)).expect(401);
  });
});

describe('cookie transport', () => {
  async function cookieLogin() {
    const adult = await registerAdult(ctx);
    const agent = ctx.http();
    const response = await agent
      .post(url('/auth/login'))
      .send({ email: adult.email, password: STRONG_PASSWORD, transport: 'cookie' })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return { adult, response, cookies, header: cookies.map((c) => c.split(';')[0]).join('; ') };
  }

  it('keeps tokens out of the body and sets HttpOnly cookies', async () => {
    const { response, cookies } = await cookieLogin();
    const result = dataOf<AuthResult>(response);
    expect(result.accessToken).toBeUndefined();
    expect(result.refreshToken).toBeUndefined();
    expect(result.csrfToken).toBeTruthy();
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite/i);
    }
  });

  it('scopes the refresh cookie to the auth path', async () => {
    const { cookies } = await cookieLogin();
    expect(cookies.find((cookie) => cookie.startsWith('iw_rt='))).toContain('Path=/api/v1/auth');
  });

  it('allows safe requests with the cookie alone', async () => {
    const { header } = await cookieLogin();
    await ctx.http().get(url('/auth/session')).set('Cookie', header).expect(200);
  });

  it('gives a reloaded page its CSRF token back, and that token works', async () => {
    const { header } = await cookieLogin();
    const session = await ctx.http().get(url('/auth/session')).set('Cookie', header).expect(200);
    await ctx
      .http()
      .post(url('/auth/logout'))
      .set('Cookie', header)
      .set('X-CSRF-Token', dataOf<AuthResult>(session).csrfToken as string)
      .expect(204);
  });

  it('does not issue a CSRF token to bearer clients, which have no use for one', async () => {
    const adult = await registerAdult(ctx);
    const session = await ctx
      .http()
      .get(url('/auth/session'))
      .set(bearer(adult.accessToken))
      .expect(200);
    expect(dataOf<AuthResult>(session).csrfToken).toBeUndefined();
  });

  it('rejects an unsafe request without a CSRF token', async () => {
    const { header } = await cookieLogin();
    const response = await ctx.http().post(url('/auth/logout')).set('Cookie', header).expect(403);
    expect(errorCode(response)).toBe(ERROR_CODES.CSRF_INVALID);
  });

  it("rejects another session's CSRF token", async () => {
    const [first, second] = [await cookieLogin(), await cookieLogin()];
    await ctx
      .http()
      .post(url('/auth/logout'))
      .set('Cookie', first.header)
      .set('X-CSRF-Token', dataOf<AuthResult>(second.response).csrfToken as string)
      .expect(403);
  });

  it('accepts an unsafe request with the right CSRF token', async () => {
    const { header, response } = await cookieLogin();
    await ctx
      .http()
      .post(url('/auth/logout'))
      .set('Cookie', header)
      .set('X-CSRF-Token', dataOf<AuthResult>(response).csrfToken as string)
      .expect(204);
  });

  it('refreshes from the cookie and rotates it', async () => {
    const { header } = await cookieLogin();
    const refreshed = await ctx
      .http()
      .post(url('/auth/refresh'))
      .set('Cookie', header)
      .send({ transport: 'cookie' })
      .expect(200);
    expect(refreshed.headers['set-cookie']).toHaveLength(2);
  });
});

describe('password recovery', () => {
  const tokenFrom = (text: string) => /token=([\w-]+)/.exec(text)?.[1] as string;

  async function requestReset(email: string) {
    await ctx.http().post(url('/auth/password/forgot')).send({ email }).expect(202);
    return tokenFrom((await ctx.email.waitFor(email)).text);
  }

  it('resets the password and ends existing sessions', async () => {
    const adult = await registerAdult(ctx);
    const token = await requestReset(adult.email);
    const newPassword = 'a completely new passphrase';

    await ctx.http().post(url('/auth/password/reset')).send({ token, newPassword }).expect(204);

    await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken)).expect(401);
    await login(adult.email).expect(401);
    await login(adult.email, newPassword).expect(200);
  });

  it('works only once', async () => {
    const adult = await registerAdult(ctx);
    const token = await requestReset(adult.email);
    const body = { token, newPassword: 'first new passphrase here' };
    await ctx.http().post(url('/auth/password/reset')).send(body).expect(204);
    const again = await ctx.http().post(url('/auth/password/reset')).send(body).expect(400);
    expect(errorCode(again)).toBe(ERROR_CODES.RESET_TOKEN_INVALID);
  });

  it('refuses an expired token', async () => {
    const adult = await registerAdult(ctx);
    const token = await requestReset(adult.email);
    await system.client.passwordResetToken.updateMany({
      where: { userId: adult.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await ctx
      .http()
      .post(url('/auth/password/reset'))
      .send({ token, newPassword: 'a completely new passphrase' })
      .expect(400);
  });

  it('answers identically for an address with no account, and sends nothing', async () => {
    const email = `${unique('ghost')}@example.test`;
    await ctx.http().post(url('/auth/password/forgot')).send({ email }).expect(202);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ctx.email.sent.some((message) => message.to === email)).toBe(false);
  });
});

describe('multi-factor authentication', () => {
  const code = (secret: string, offset = 0) =>
    hotp(base32Decode(secret), totpStep(Date.now() / 1000) + BigInt(offset));

  async function enrolled() {
    const adult = await registerAdult(ctx);
    const enrollment = await ctx
      .http()
      .post(url('/auth/mfa/enroll'))
      .set(bearer(adult.accessToken))
      .expect(201);
    const { secret } = dataOf<{ secret: string }>(enrollment);
    await ctx
      .http()
      .post(url('/auth/mfa/confirm'))
      .set(bearer(adult.accessToken))
      .send({ code: code(secret) })
      .expect(204);
    return { adult, secret };
  }

  it('stores the secret encrypted', async () => {
    const { adult, secret } = await enrolled();
    const factor = await system.client.userMfaFactor.findUniqueOrThrow({
      where: { userId: adult.userId },
    });
    expect(factor.secretEncrypted).not.toContain(secret);
  });

  it('reports the factor in the session view only once it is confirmed', async () => {
    const adult = await registerAdult(ctx);
    const before = await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken));
    expect(dataOf<{ mfaEnabled: boolean }>(before).mfaEnabled).toBe(false);

    await ctx.http().post(url('/auth/mfa/enroll')).set(bearer(adult.accessToken)).expect(201);
    const pending = await ctx.http().get(url('/auth/session')).set(bearer(adult.accessToken));
    expect(dataOf<{ mfaEnabled: boolean }>(pending).mfaEnabled).toBe(false);

    const { adult: confirmed } = await enrolled();
    const after = await ctx.http().get(url('/auth/session')).set(bearer(confirmed.accessToken));
    expect(dataOf<{ mfaEnabled: boolean }>(after).mfaEnabled).toBe(true);
  });

  it('requires a code at login once enabled', async () => {
    const { adult } = await enrolled();
    const response = await login(adult.email).expect(401);
    expect(errorCode(response)).toBe(ERROR_CODES.MFA_REQUIRED);
  });

  it('accepts a valid code and marks the session verified', async () => {
    const { adult, secret } = await enrolled();
    const result = dataOf<AuthResult>(
      await login(adult.email, STRONG_PASSWORD, { mfaCode: code(secret, 1) }).expect(200),
    );
    const sessions = await system.client.userSession.findMany({
      where: { userId: adult.userId, revokedAt: null, mfaVerifiedAt: { not: null } },
    });
    expect(sessions.length).toBeGreaterThan(0);
    expect(result.accessToken).toBeTruthy();
  });

  it('refuses to reuse a code', async () => {
    const { adult, secret } = await enrolled();
    const mfaCode = code(secret, 1);
    await login(adult.email, STRONG_PASSWORD, { mfaCode }).expect(200);
    const replay = await login(adult.email, STRONG_PASSWORD, { mfaCode }).expect(401);
    expect(errorCode(replay)).toBe(ERROR_CODES.MFA_INVALID);
  });

  it('cannot be replaced by re-enrolling once confirmed', async () => {
    const { adult } = await enrolled();
    const relogin = await system.client.userSession.findFirstOrThrow({
      where: { userId: adult.userId },
    });
    expect(relogin).toBeTruthy();
    await ctx.http().post(url('/auth/mfa/enroll')).set(bearer(adult.accessToken)).expect(409);
  });
});
