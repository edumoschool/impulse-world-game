import { expect, type Page } from '@playwright/test';

export const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export const PASSWORD = 'a long family passphrase';

export async function registerParent(page: Page, name = 'Sam Parent') {
  const email = `parent-${unique()}@example.test`;
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByRole('link', { name: 'Create a family account' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();
  return { email, password: PASSWORD };
}

/** Calls the API as the signed-in page, with its cookies and CSRF token. */
export async function apiAs<T>(page: Page, method: 'GET' | 'POST', path: string, data?: object) {
  const session = await page.request.get('/api/v1/auth/session');
  const { csrfToken } = ((await session.json()) as { data: { csrfToken?: string } }).data;
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  });
  expect(response.ok(), `${method} ${path} -> ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}
