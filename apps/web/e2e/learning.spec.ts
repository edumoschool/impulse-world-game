import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';
import { unique } from './support/journeys';
import { MailSink } from './support/mail-sink';

/**
 * Stage 3 acceptance: a learner completes a lesson and an assessment in the web app. Staff set
 * up and publish the content through the API, since the authoring screens come later.
 */
const sink = new MailSink();
let listening = false;
let http: APIRequestContext;

test.beforeAll(async () => {
  listening = await sink.start();
  http = await request.newContext({ baseURL: 'http://localhost:3000' });
});

test.afterAll(async () => {
  await http.dispose();
  await sink.stop();
});

const PASSCODE = 'sunny-otter-42';

async function call<T>(token: string | null, method: string, path: string, data?: object) {
  const response = await http.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  expect(response.ok(), `${method} ${path} -> ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

interface Auth {
  accessToken: string;
}

async function registerAdult(name: string) {
  const email = `${name.toLowerCase()}-${unique()}@example.test`;
  const auth = await call<Auth>(null, 'POST', '/auth/register', {
    email,
    password: 'a long staff passphrase',
    displayName: name,
    transport: 'bearer',
  });
  return { email, token: auth.accessToken };
}

const switchTo = async (token: string, tenantId: string) =>
  (await call<Auth>(token, 'POST', '/auth/switch-tenant', { tenantId })).accessToken;

/** A school with an owner, a content creator and a reviewer, all signed in to it. */
async function school() {
  const owner = await registerAdult('Owner');
  const { tenantId } = await call<{ tenantId: string }>(owner.token, 'POST', '/organizations', {
    name: `Learning School ${unique()}`,
    kind: 'PRIVATE_SCHOOL',
  });
  const ownerToken = await switchTo(owner.token, tenantId);
  const [root] = await call<{ id: string }[]>(ownerToken, 'GET', '/organizations/units');
  const join = async (role: string) => {
    const adult = await registerAdult(role.replace('CONTENT_', '').toLowerCase());
    await call(ownerToken, 'POST', '/organizations/invitations', {
      email: adult.email,
      role,
      organizationId: root?.id,
    });
    const mail = await sink.waitFor(adult.email);
    const token = /([0-9a-f-]{36}\.[\w-]+)/.exec(mail.text)?.[1];
    await call(adult.token, 'POST', '/invitations/accept', { token });
    return switchTo(adult.token, tenantId);
  };
  return {
    tenantId,
    owner: ownerToken,
    creator: await join('CONTENT_CREATOR'),
    reviewer: await join('CONTENT_REVIEWER'),
  };
}

type School = Awaited<ReturnType<typeof school>>;
type Versioned = { id: string; versions: { id: string }[] };

async function publish(s: School, path: string, created: Versioned) {
  const versionId = created.versions[0]?.id;
  await call(s.creator, 'POST', `/${path}/${versionId}/transitions`, { action: 'submit' });
  await call(s.reviewer, 'POST', `/${path}/${versionId}/transitions`, { action: 'approve' });
  await call(s.reviewer, 'POST', `/${path}/${versionId}/transitions`, { action: 'publish' });
  return versionId as string;
}

/** Publishes a lesson, a two-question quiz and a path, and adds a child who can sign in. */
async function classroom() {
  const s = await school();
  const subjects = await call<{ id: string; code: string }[]>(
    s.creator,
    'GET',
    '/curriculum/subjects',
  );
  const subjectId = subjects.find((subject) => subject.code === 'MATH')?.id;
  const bank = await call<{ id: string }>(s.creator, 'POST', '/question-banks', {
    subjectId,
    title: { en: 'Counting' },
  });
  const question = async (definition: object) =>
    publish(
      s,
      'question-versions',
      await call<Versioned>(s.creator, 'POST', `/question-banks/${bank.id}/questions`, {
        definition,
      }),
    );
  const apples = await question({
    type: 'MULTIPLE_CHOICE',
    prompt: { en: 'How many apples are there?' },
    options: [
      { id: 'a', text: { en: '2' } },
      { id: 'b', text: { en: '3' } },
    ],
    answer: { correctOptionId: 'b' },
  });
  const sky = await question({
    type: 'TRUE_FALSE',
    prompt: { en: 'Three is more than two.' },
    answer: { correct: true },
  });
  const lesson = await call<Versioned>(s.creator, 'POST', '/lessons', {
    subjectId,
    content: {
      title: { en: 'Counting apples', ru: 'Считаем яблоки' },
      estimatedMinutes: 5,
      blocks: [
        { id: 'intro', type: 'TEXT', body: { en: 'Point at each apple and say its number.' } },
        {
          id: 'picture',
          type: 'IMAGE',
          asset: 'images/apples.png',
          alt: { en: 'Three red apples' },
        },
        { id: 'try', type: 'QUESTION', questionVersionId: apples },
      ],
    },
  });
  await publish(s, 'lesson-versions', lesson);
  const quiz = await call<Versioned>(s.creator, 'POST', '/assessments', {
    subjectId,
    content: {
      title: { en: 'Counting quiz' },
      items: [
        { id: 'apples', questionVersionId: apples },
        { id: 'compare', questionVersionId: sky },
      ],
      passingScore: 0.5,
    },
  });
  await publish(s, 'assessment-versions', quiz);
  const path = await call<Versioned>(s.creator, 'POST', '/learning-paths', {
    subjectId,
    content: {
      title: { en: 'Numbers to ten' },
      units: [{ id: 'start', title: { en: 'Counting' }, lessonIds: [lesson.id] }],
    },
  });
  await publish(s, 'learning-path-versions', path);

  const username = `nova-${unique()}`;
  await call(s.owner, 'POST', '/children', {
    displayName: 'Nova',
    username,
    passcode: PASSCODE,
    birthYear: new Date().getFullYear() - 8,
    consent: { policyVersion: '2026-10', scopes: ['ACCOUNT_ACCESS', 'LEARNING_ANALYTICS'] },
  });
  const session = await call<{ tenants: { tenantId: string; loginCode: string }[] }>(
    s.owner,
    'GET',
    '/auth/session',
  );
  const code = session.tenants.find((tenant) => tenant.tenantId === s.tenantId)
    ?.loginCode as string;
  return { code, username };
}

async function childSignIn(page: Page, code: string, username: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Family code').fill(code);
  await page.getByLabel('Explorer name').fill(username);
  await page.getByLabel('Secret passcode').fill(PASSCODE);
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Nova' })).toBeVisible();
}

test('a child finishes a lesson, follows a path and takes a quiz the server marks', async ({
  page,
}) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');
  const { code, username } = await classroom();
  await childSignIn(page, code, username);

  // The lesson: its text, the picture's description, and a practice question.
  await page.getByRole('link', { name: /Counting apples/ }).click();
  await expect(page.getByRole('heading', { name: 'Counting apples' })).toBeVisible();
  await expect(page.getByText('Point at each apple and say its number.')).toBeVisible();
  await expect(page.getByText('Three red apples')).toBeVisible();
  await page.getByRole('radio', { name: '3' }).check();
  await page.getByRole('button', { name: 'I finished this lesson' }).click();
  await expect(page.getByText('Lesson finished. Well done!')).toBeVisible();

  // The path now shows that lesson as done.
  await page.getByRole('link', { name: 'Back to my learning' }).click();
  await page.getByRole('link', { name: /Numbers to ten/ }).click();
  await expect(page.getByTestId('path-lesson')).toContainText('Done');

  // The quiz: one right answer and one wrong one, marked by the server.
  await page.getByRole('link', { name: 'Back to my learning' }).click();
  await page.getByRole('link', { name: /Counting quiz/ }).click();
  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
  await page.getByRole('radio', { name: '3' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Question 2 of 2')).toBeVisible();
  await page.getByRole('radio', { name: 'False' }).check();
  await page.getByRole('button', { name: 'Finish and check' }).click();

  await expect(page.getByRole('heading', { name: 'Your result' })).toBeVisible();
  await expect(page.getByTestId('quiz-score')).toHaveText('1 of 2 points');
  await expect(page.getByText('You passed!')).toBeVisible();
  await expect(page.getByTestId('quiz-outcome')).toHaveText([/Right$/, /Not right$/]);
  const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width).toBeLessThanOrEqual(0);

  // Progress counts the lesson.
  await page.getByRole('link', { name: 'Back to my learning' }).click();
  await page.getByRole('link', { name: 'My progress' }).click();
  await expect(page.getByTestId('lessons-finished')).toHaveText('Lessons finished: 1');
});

test('a quiz picks up where the child left off after a reload', async ({ page }) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');
  const { code, username } = await classroom();
  await childSignIn(page, code, username);

  await page.getByRole('link', { name: /Counting quiz/ }).click();
  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await page.getByRole('radio', { name: '3' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Question 2 of 2')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Start the quiz' }).click();
  await expect(page.getByRole('radio', { name: '3' })).toBeChecked();
});
