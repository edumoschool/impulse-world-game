import { expect, type Page, test } from '@playwright/test';
import { apiAs, PASSWORD, registerParent, unique } from './support/journeys';
import { MailSink } from './support/mail-sink';
import { totp } from './support/totp';

async function enableMfa(page: Page) {
  await page.getByRole('link', { name: 'Account security' }).click();
  await expect(page.getByText('Two-step sign-in is off.')).toBeVisible();
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();

  const secret = ((await page.getByTestId('mfa-secret').textContent()) as string).replace(
    /\s/g,
    '',
  );
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const codes = await page.getByTestId('recovery-codes').locator('li').allTextContents();
  expect(codes).toHaveLength(10);
  await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled();
  await page.getByLabel('I have saved my recovery codes').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Two-step sign-in is on.', { exact: true })).toBeVisible();
  return { secret, codes };
}

async function signInAsAdult(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
}

test('a parent turns on two-step sign-in, and then needs a code to sign in', async ({ page }) => {
  const { email } = await registerParent(page);
  const { secret } = await enableMfa(page);

  await page.reload();
  await expect(page.getByText(/You will be asked for a code/)).toBeVisible();
  await expect(page.getByText('Recovery codes left: 10')).toBeVisible();

  await signInAsAdult(page, email);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Enter the 6 digits from your app.')).toBeVisible();

  const wrong = totp(secret, 1) === '000000' ? '111111' : '000000';
  await page.getByLabel('6-digit code').fill(wrong);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code is not right')).toBeVisible();

  // The confirmation used the current step, and a used step is refused, so take the next one.
  await page.getByLabel('6-digit code').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();
});

test('a lost phone: sign in with a recovery code, replace the codes, then turn MFA off', async ({
  page,
}) => {
  const { email } = await registerParent(page);
  const { secret, codes } = await enableMfa(page);

  await signInAsAdult(page, email);
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click();
  await page.getByLabel('Recovery code').fill((codes[0] as string).toUpperCase());
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();

  await page.getByRole('link', { name: 'Account security' }).click();
  await expect(page.getByText('Recovery codes left: 9')).toBeVisible();

  await page.getByLabel('6-digit code').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Create new codes' }).click();
  await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
  const fresh = await page.getByTestId('recovery-codes').locator('li').allTextContents();
  expect(fresh).toHaveLength(10);
  expect(fresh).not.toContain(codes[1]);
  await page.getByLabel('I have saved my recovery codes').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Recovery codes left: 10')).toBeVisible();

  await page.getByLabel('Password').fill('not my password at all');
  await page.getByLabel('Code from your app, or a recovery code').fill(fresh[0] as string);
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Those sign-in details are not right')).toBeVisible();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Code from your app, or a recovery code').fill(fresh[0] as string);
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Two-step sign-in is off.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();
});

test('a wrong invitation code is explained, and nothing changes', async ({ page }) => {
  await registerParent(page);
  await page.getByRole('link', { name: 'Join with an invitation code' }).click();
  await page.getByLabel('Invitation code').fill(`${crypto.randomUUID()}.${'x'.repeat(43)}`);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('This invitation code is not valid')).toBeVisible();
  await expect(page.getByLabel('Workspace')).toHaveCount(0);
});

test('after signing in, a return path never leaves the site', async ({ page }) => {
  const { email } = await registerParent(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/sign-in?next=%2F%2Fevil.example%2Fsteal');
  // An unsafe return path is ignored entirely, so the page opens on the child form as usual.
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your explorers' })).toBeVisible();
  expect(new URL(page.url()).host).toBe('localhost:3000');
});

/** Creates a school owned by a new parent, opens it, and returns what an invite needs. */
async function createSchool(page: Page, ownerName: string) {
  await registerParent(page, ownerName);
  const school = `Sunrise School ${unique()}`;
  await apiAs(page, 'POST', '/organizations', { name: school, kind: 'PRIVATE_SCHOOL' });
  await page.reload();
  await page.getByLabel('Workspace').selectOption({ label: school });
  await expect(page.getByText(`${ownerName} · ${school}`)).toBeVisible();
  const units = await apiAs<{ id: string; kind: string }[]>(page, 'GET', '/organizations/units');
  return { school, rootId: units.find((unit) => unit.kind === 'ROOT')?.id as string };
}

test.describe('with mail captured', () => {
  const sink = new MailSink();
  let listening = false;

  test.beforeAll(async () => {
    listening = await sink.start();
  });

  test.afterAll(async () => {
    await sink.stop();
  });

  test('a teacher accepts an emailed invitation, and both adults can switch workspaces', async ({
    page,
    browser,
  }) => {
    test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');

    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    const { email: teacherEmail } = await registerParent(teacher, 'Rano Teacher');

    const { school, rootId } = await createSchool(page, 'Olim Owner');
    await apiAs(page, 'POST', '/organizations/invitations', {
      email: teacherEmail,
      role: 'TEACHER',
      organizationId: rootId,
    });

    const mail = await sink.waitFor(teacherEmail);
    const token = /[0-9a-f-]{36}\.\S+/.exec(mail.text)?.[0] as string;
    expect(token).toBeTruthy();

    await teacher.getByRole('link', { name: 'Join with an invitation code' }).click();
    await teacher.getByLabel('Invitation code').fill(token);
    await teacher.getByRole('button', { name: 'Join' }).click();
    await expect(teacher.getByText(`Rano Teacher · ${school}`)).toBeVisible();

    // A code works once.
    await teacher.goto('/invitations/accept');
    await teacher.getByLabel('Invitation code').fill(token);
    await teacher.getByRole('button', { name: 'Join' }).click();
    await expect(teacher.getByText('This invitation code is not valid')).toBeVisible();

    // Back to the family workspace, and the choice survives a reload.
    await teacher.goto('/dashboard');
    const family = await teacher.getByLabel('Workspace').locator('option').first().textContent();
    await teacher.getByLabel('Workspace').selectOption({ label: family as string });
    await expect(teacher.getByText(`Rano Teacher · ${family}`)).toBeVisible();
    await teacher.reload();
    await expect(teacher.getByText(`Rano Teacher · ${family}`)).toBeVisible();

    await teacherContext.close();
  });

  test('someone with no account follows the emailed link, signs up and lands in the school', async ({
    page,
    browser,
  }) => {
    test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');

    const { school, rootId } = await createSchool(page, 'Olim Owner');
    const newcomer = `newcomer-${unique()}@example.test`;
    await apiAs(page, 'POST', '/organizations/invitations', {
      email: newcomer,
      role: 'TEACHER',
      organizationId: rootId,
    });
    const mail = await sink.waitFor(newcomer);
    const link = /https?:\/\/\S+\/invitations\/accept\?code=\S+/.exec(mail.text)?.[0] as string;
    expect(link).toBeTruthy();

    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto(new URL(link).pathname + new URL(link).search);
    await expect(visitor).toHaveURL(/\/sign-in\?next=/);
    await expect(visitor.getByText(/Sign in, or create an account/)).toBeVisible();

    await visitor.getByRole('link', { name: 'Create a family account' }).click();
    await visitor.getByLabel('Your name').fill('Nodira Newcomer');
    await visitor.getByLabel('Email').fill(newcomer);
    await visitor.getByLabel('Password').fill(PASSWORD);
    await visitor.getByRole('button', { name: 'Create account' }).click();

    await expect(visitor.getByRole('heading', { name: 'Join with an invitation' })).toBeVisible();
    await expect(visitor.getByLabel('Invitation code')).not.toHaveValue('');
    await visitor.getByRole('button', { name: 'Join' }).click();
    await expect(visitor.getByText(`Nodira Newcomer · ${school}`)).toBeVisible();
    await context.close();
  });
});
