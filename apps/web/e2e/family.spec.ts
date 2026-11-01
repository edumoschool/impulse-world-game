import { expect, type Page, test } from '@playwright/test';
import { registerParent, unique } from './support/journeys';

/** The parent journey from spec section 32, followed by the child signing in. */
const birthYear = String(new Date().getFullYear() - 8);

async function addChild(page: Page, username: string, passcode: string) {
  await page.getByRole('button', { name: 'Add a child' }).click();
  await page.getByLabel('Name shown in the game').fill('Nova');
  await page.getByLabel('Explorer name for signing in').fill(username);
  await page.getByLabel('Secret passcode').fill(passcode);
  await page.getByLabel('Birth year').fill(birthYear);
  await page.getByLabel(/I am this child/).check();
  await page.getByLabel(/Track learning progress/).check();
  await page.getByRole('button', { name: 'Add child', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nova' })).toBeVisible();
}

async function childSignIn(page: Page, code: string, username: string, passcode: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Family code').fill(code);
  await page.getByLabel('Explorer name').fill(username);
  await page.getByLabel('Secret passcode').fill(passcode);
  await page.getByRole('button', { name: 'Start exploring' }).click();
}

test('a parent registers, adds a child and the child signs in', async ({ page }) => {
  await registerParent(page);
  await expect(page.getByRole('heading', { name: 'No explorers yet' })).toBeVisible();

  const username = `nova-${unique()}`;
  await addChild(page, username, 'sunny-otter-42');
  const code = (await page.getByTestId('family-code').textContent()) as string;

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Start exploring' })).toBeVisible();

  await childSignIn(page, code, username, 'sunny-otter-42');
  await expect(page.getByRole('heading', { name: 'Hello, Nova' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Start exploring' })).toBeVisible();
});

test('a session survives a reload, and CSRF-protected actions still work after it', async ({
  page,
}) => {
  await registerParent(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();

  await addChild(page, `nova-${unique()}`, 'sunny-otter-42');
});

test('a parent changes settings, and they persist', async ({ page }) => {
  await registerParent(page);
  await addChild(page, `nova-${unique()}`, 'sunny-otter-42');

  await page.getByRole('button', { name: 'Manage Nova' }).click();
  await page.getByLabel('Daily time limit').selectOption('60');
  await expect(page.getByText('Settings saved')).toBeVisible();
  await page.getByLabel(/AI tutor/).click();
  await expect(page.getByLabel(/AI tutor/)).toBeChecked();
  await expect(page.getByText('Settings saved')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Manage Nova' }).click();
  await expect(page.getByLabel('Daily time limit')).toHaveValue('60');
  await expect(page.getByLabel(/AI tutor/)).toBeChecked();
});

test('withdrawing consent stops the child signing in', async ({ page, browser }) => {
  await registerParent(page);
  const username = `nova-${unique()}`;
  await addChild(page, username, 'sunny-otter-42');
  const code = (await page.getByTestId('family-code').textContent()) as string;

  await page.getByRole('button', { name: 'Manage Nova' }).click();
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await page.getByRole('button', { name: 'Withdraw permission' }).click();
  await expect(page.getByText(/Withdrawn on/)).toBeVisible();

  const childContext = await browser.newContext();
  const childPage = await childContext.newPage();
  await childSignIn(childPage, code, username, 'sunny-otter-42');
  await expect(childPage.getByRole('alert').filter({ hasText: 'guardian' })).toBeVisible();
  await childContext.close();
});

test('a wrong passcode shows a clear message and stays on the form', async ({ page }) => {
  // A unique name, because repeated failures on one name correctly trigger the lockout.
  await childSignIn(page, 'NOSUCHCD', `nobody-${unique()}`, 'wrong-passcode');
  await expect(page.getByRole('alert').filter({ hasText: 'sign-in details' })).toBeVisible();
  await expect(page).toHaveURL(/sign-in/);
});

test('a signed-out visitor cannot open the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/sign-in/);
});

test('the interface switches language and remembers it', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Language').selectOption('ru');
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

  await page.getByLabel('Язык').selectOption('uz');
  await expect(page.getByRole('button', { name: 'Boshlash' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Boshlash' })).toBeVisible();
});

test('an empty form points at what to fix', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByText('Fill in this field.').first()).toBeVisible();
  await expect(page.getByLabel('Family code')).toHaveAttribute('aria-invalid', 'true');
});

test('the page has no horizontal scroll', async ({ page }) => {
  await page.goto('/sign-in');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
