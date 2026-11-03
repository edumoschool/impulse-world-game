import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { unique } from './journeys';
import type { MailSink } from './mail-sink';

export const STAFF_PASSWORD = 'a long staff passphrase';
export const CHILD_PASSCODE = 'sunny-otter-42';

export interface Staff {
  email: string;
  token: string;
}

export interface SchoolSetup {
  tenantId: string;
  name: string;
  owner: string;
  creator: Staff;
  reviewer: Staff;
}

export type Versioned = { id: string; versions: { id: string }[] };

/**
 * Sets up schools through the API with bearer tokens, for journeys whose subject is something
 * else. Invitations arrive by email, so it needs the SMTP sink.
 */
export class SchoolApi {
  constructor(
    private readonly http: APIRequestContext,
    private readonly sink: MailSink,
  ) {}

  async call<T>(token: string | null, method: string, path: string, data?: object): Promise<T> {
    const response = await this.http.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    expect(response.ok(), `${method} ${path} -> ${response.status()}`).toBe(true);
    return ((await response.json()) as { data: T }).data;
  }

  async registerAdult(name: string): Promise<Staff> {
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}-${unique()}@example.test`;
    const auth = await this.call<{ accessToken: string }>(null, 'POST', '/auth/register', {
      email,
      password: STAFF_PASSWORD,
      displayName: name,
      transport: 'bearer',
    });
    return { email, token: auth.accessToken };
  }

  private async switchTo(token: string, tenantId: string) {
    return (
      await this.call<{ accessToken: string }>(token, 'POST', '/auth/switch-tenant', { tenantId })
    ).accessToken;
  }

  /** A school with an owner, a content creator and a reviewer, all switched into it. */
  async school(): Promise<SchoolSetup> {
    const owner = await this.registerAdult('Owner');
    const name = `Learning School ${unique()}`;
    const { tenantId } = await this.call<{ tenantId: string }>(
      owner.token,
      'POST',
      '/organizations',
      {
        name,
        kind: 'PRIVATE_SCHOOL',
      },
    );
    const ownerToken = await this.switchTo(owner.token, tenantId);
    const [root] = await this.call<{ id: string }[]>(ownerToken, 'GET', '/organizations/units');
    const join = async (role: string, displayName: string): Promise<Staff> => {
      const adult = await this.registerAdult(displayName);
      await this.call(ownerToken, 'POST', '/organizations/invitations', {
        email: adult.email,
        role,
        organizationId: root?.id,
      });
      const mail = await this.sink.waitFor(adult.email);
      const token = /([0-9a-f-]{36}\.[\w-]+)/.exec(mail.text)?.[1];
      await this.call(adult.token, 'POST', '/invitations/accept', { token });
      return { email: adult.email, token: await this.switchTo(adult.token, tenantId) };
    };
    return {
      tenantId,
      name,
      owner: ownerToken,
      creator: await join('CONTENT_CREATOR', 'Cora Creator'),
      reviewer: await join('CONTENT_REVIEWER', 'Rami Reviewer'),
    };
  }

  /** Submits as the creator, then approves and publishes as the reviewer. */
  async publish(s: SchoolSetup, path: string, created: Versioned): Promise<string> {
    const versionId = created.versions[0]?.id;
    await this.call(s.creator.token, 'POST', `/${path}/${versionId}/transitions`, {
      action: 'submit',
    });
    await this.call(s.reviewer.token, 'POST', `/${path}/${versionId}/transitions`, {
      action: 'approve',
    });
    await this.call(s.reviewer.token, 'POST', `/${path}/${versionId}/transitions`, {
      action: 'publish',
    });
    return versionId as string;
  }

  /** Adds a child to the school. Returns what the child signs in with. */
  async addChild(s: SchoolSetup): Promise<{ code: string; username: string }> {
    const username = `nova-${unique()}`;
    await this.call(s.owner, 'POST', '/children', {
      displayName: 'Nova',
      username,
      passcode: CHILD_PASSCODE,
      birthYear: new Date().getFullYear() - 8,
      consent: { policyVersion: '2026-10', scopes: ['ACCOUNT_ACCESS', 'LEARNING_ANALYTICS'] },
    });
    const session = await this.call<{ tenants: { tenantId: string; loginCode: string }[] }>(
      s.owner,
      'GET',
      '/auth/session',
    );
    const code = session.tenants.find((tenant) => tenant.tenantId === s.tenantId)
      ?.loginCode as string;
    return { code, username };
  }
}

export async function childSignIn(page: Page, code: string, username: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Family code').fill(code);
  await page.getByLabel('Explorer name').fill(username);
  await page.getByLabel('Secret passcode').fill(CHILD_PASSCODE);
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Nova' })).toBeVisible();
}

/** Signs an adult in through the page and opens the school workspace. */
export async function staffSignIn(page: Page, email: string, school: string) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Workspace')).toBeVisible();
  await page.getByLabel('Workspace').selectOption({ label: school });
  await expect(page.getByText(` · ${school}`)).toBeVisible();
}
