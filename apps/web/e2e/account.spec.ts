import { expect, test } from '@playwright/test';
import { apiAs, PASSWORD, registerParent, unique } from './support/journeys';
import { MailSink } from './support/mail-sink';
import { totp } from './support/totp';

test('a parent turns on two-step sign-in, and then needs a code to sign in', async ({ page }) => {
  const { email } = await registerParent(page);
  await page.getByRole('link', { name: 'Account security' }).click();
  await expect(page.getByText('Two-step sign-in is off.')).toBeVisible();
  await page.getByRole('button', { name: 'Turn on two-step sign-in' }).click();

  const secret = ((await page.getByTestId('mfa-secret').textContent()) as string).replace(
    /\s/g,
    '',
  );
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(page.getByText('Two-step sign-in is on.', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(/You will be asked for a code/)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'I am a grown-up' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();

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

test('a wrong invitation code is explained, and nothing changes', async ({ page }) => {
  await registerParent(page);
  await page.getByRole('link', { name: 'Join with an invitation code' }).click();
  await page.getByLabel('Invitation code').fill(`${crypto.randomUUID()}.${'x'.repeat(43)}`);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('This invitation code is not valid')).toBeVisible();
  await expect(page.getByLabel('Workspace')).toHaveCount(0);
});

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

    await registerParent(page, 'Olim Owner');
    const school = `Sunrise School ${unique()}`;
    await apiAs(page, 'POST', '/organizations', { name: school, kind: 'PRIVATE_SCHOOL' });
    await page.reload();
    await page.getByLabel('Workspace').selectOption({ label: school });
    await expect(page.getByText(`Olim Owner · ${school}`)).toBeVisible();

    const units = await apiAs<{ id: string; kind: string }[]>(page, 'GET', '/organizations/units');
    const root = units.find((unit) => unit.kind === 'ROOT');
    await apiAs(page, 'POST', '/organizations/invitations', {
      email: teacherEmail,
      role: 'TEACHER',
      organizationId: root?.id,
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
});
