import { expect, test } from '@playwright/test';
import { registerParent, unique } from './support/journeys';
import { MailSink } from './support/mail-sink';

const sink = new MailSink();
let listening = false;

test.beforeAll(async () => {
  listening = await sink.start();
});

test.afterAll(async () => {
  await sink.stop();
});

test('an owner sets up a school, builds its structure, invites a teacher and removes them', async ({
  page,
  browser,
}) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');

  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const { email: teacherEmail } = await registerParent(teacher, 'Rano Teacher');

  await registerParent(page, 'Olim Owner');
  await page.getByRole('link', { name: 'Set up a school or learning centre' }).click();
  const school = `Sunrise School ${unique()}`;
  await page.getByLabel('School name').fill(school);
  await page.getByLabel('Type').selectOption({ label: 'Learning centre' });
  await page.getByRole('button', { name: 'Create school' }).click();

  await expect(page.getByRole('heading', { name: 'School structure and people' })).toBeVisible();
  const units = page.getByTestId('units');
  await expect(units).toContainText(school);
  await expect(page.getByLabel('Workspace')).toHaveValue(/.+/);

  await page.getByLabel('Name', { exact: true }).fill('North Branch');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('North Branch added.')).toBeVisible();
  await expect(units).toContainText('North Branch');

  await page.getByLabel('Name', { exact: true }).fill('Maths');
  await page.getByLabel('Type').selectOption({ label: 'Department' });
  await page.getByLabel('Part of').selectOption({ label: '— North Branch' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(units).toContainText('Maths');

  const me = page.getByTestId('member').filter({ hasText: 'Olim Owner (You)' });
  await expect(me).toContainText('Owner');
  await expect(me.getByRole('button', { name: 'Remove' })).toHaveCount(0);

  await page.getByLabel('Email').fill(teacherEmail);
  await page.getByLabel('Role').selectOption({ label: 'Teacher' });
  await page.getByLabel('Where they work').selectOption({ label: '— — Maths' });
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${teacherEmail}`)).toBeVisible();
  await expect(page.getByTestId('pending-invitation')).toContainText(teacherEmail);

  // A mistaken invitation can be cancelled.
  const mistake = `wrong-${unique()}@example.test`;
  await page.getByLabel('Email').fill(mistake);
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByTestId('pending-invitation').filter({ hasText: mistake })).toBeVisible();
  await page
    .getByTestId('pending-invitation')
    .filter({ hasText: mistake })
    .getByRole('button', { name: 'Cancel invitation' })
    .click();
  await expect(page.getByText(`The invitation to ${mistake} was cancelled.`)).toBeVisible();
  await expect(page.getByTestId('pending-invitation').filter({ hasText: mistake })).toHaveCount(0);

  const mail = await sink.waitFor(teacherEmail);
  const link = new URL(/https?:\/\/\S+/.exec(mail.text)?.[0] as string);
  await teacher.goto(`${link.pathname}${link.search}`);
  await expect(teacher.getByLabel('Invitation code')).not.toHaveValue('');
  await teacher.getByRole('button', { name: 'Join' }).click();
  await expect(teacher.getByText(`Rano Teacher · ${school}`)).toBeVisible();

  // A teacher can see the structure, but not manage people.
  await teacher.getByRole('link', { name: 'Manage school' }).click();
  await expect(teacher.getByTestId('units')).toContainText('Maths');
  await expect(teacher.getByRole('heading', { name: 'People', exact: true })).toHaveCount(0);
  await expect(teacher.getByRole('button', { name: 'Send invitation' })).toHaveCount(0);

  await page.reload();
  const member = page.getByTestId('member').filter({ hasText: 'Rano Teacher' });
  await expect(member).toContainText('Teacher · Maths');
  await member.getByRole('button', { name: 'Remove' }).click();
  await member.getByRole('button', { name: 'Remove from school' }).click();
  await expect(page.getByText('Rano Teacher was removed.')).toBeVisible();
  await expect(page.getByTestId('member').filter({ hasText: 'Rano Teacher' })).toHaveCount(0);

  // The removed teacher loses the school straight away, and lands back in their own family.
  await teacher.goto('/dashboard');
  await expect(teacher.getByRole('heading', { name: 'Your explorers' })).toBeVisible();
  await expect(teacher.getByText(school)).toHaveCount(0);
  await expect(teacher.getByRole('button', { name: 'Sign out' })).toBeEnabled();

  await teacherContext.close();
});

test('a family workspace offers no school management', async ({ page }) => {
  await registerParent(page);
  await expect(page.getByRole('link', { name: 'Manage school' })).toHaveCount(0);
});
