import { type APIRequestContext, expect, type Page, request, test } from '@playwright/test';
import { MailSink } from './support/mail-sink';
import { childSignIn, SchoolApi, staffSignIn } from './support/school-api';

/**
 * The review workflow in the content studio: a creator writes, a reviewer sends work back,
 * approves and publishes, nobody reviews their own work, and children see only what went live.
 */
const sink = new MailSink();
let listening = false;
let http: APIRequestContext;
let setup: SchoolApi;

test.beforeAll(async () => {
  listening = await sink.start();
  http = await request.newContext({ baseURL: 'http://localhost:3000' });
  setup = new SchoolApi(http, sink);
});

test.afterAll(async () => {
  await http.dispose();
  await sink.stop();
});

const version = (page: Page) => page.getByTestId('version').first();

test('a creator writes a question and a lesson, a reviewer sends back and publishes, a child sees it', async ({
  page: creator,
  browser,
}) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');
  const school = await setup.school();
  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();

  // The creator writes a question in a new bank, and sends it for review.
  await staffSignIn(creator, school.creator.email, school.name);
  await creator.getByRole('link', { name: 'Content studio' }).click();
  await expect(creator.getByRole('heading', { name: 'Content studio' })).toBeVisible();
  await creator.getByLabel('Title (English)').fill('Counting');
  await creator.getByLabel('Subject').selectOption({ label: 'Mathematics' });
  await creator.getByRole('button', { name: 'Create bank' }).click();
  await creator.getByRole('link', { name: /Counting/ }).click();
  await creator.getByRole('link', { name: 'New question' }).click();
  await creator.getByLabel('Question (English)').fill('How many apples are there?');
  await creator.getByLabel('Option 1 (English)').fill('2');
  await creator.getByLabel('Option 2 (English)').fill('3');
  // Saving without a right answer is caught before anything is sent.
  await creator.getByRole('button', { name: 'Save draft' }).click();
  await expect(creator.getByText('Fix these before saving:')).toBeVisible();
  await creator.getByLabel('This is a right answer').nth(1).check();
  await creator.getByRole('button', { name: 'Save draft' }).click();
  await expect(version(creator)).toContainText('Version 1 · written by you');
  await expect(version(creator)).toContainText('Draft');
  // The author is offered no way to approve their own work.
  await expect(creator.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await creator.getByRole('button', { name: 'Send for review' }).click();
  await expect(version(creator)).toContainText('In review');
  await expect(creator.getByText('This version is in review.')).toBeVisible();

  // The reviewer finds it in the queue, approves and publishes it.
  await staffSignIn(reviewer, school.reviewer.email, school.name);
  await reviewer.goto('/content');
  await reviewer
    .getByTestId('review-queue')
    .getByRole('link', { name: /How many apples/ })
    .click();
  await reviewer.getByRole('button', { name: 'Approve' }).click();
  await expect(version(reviewer)).toContainText('Approved');
  await reviewer.getByRole('button', { name: 'Publish' }).click();
  await expect(version(reviewer)).toContainText('Live');

  // The creator writes a lesson around the published question.
  await creator.goto('/content');
  await creator.getByRole('link', { name: 'New lesson' }).click();
  // The studio home has its own Subject field, so wait until the new page has replaced it.
  await expect(creator.getByRole('heading', { name: 'New lesson' })).toBeVisible();
  await creator.getByLabel('Subject').selectOption({ label: 'Mathematics' });
  await creator.getByLabel('Title (English)').fill('Counting apples');
  await creator.getByLabel('Text (English)').fill('Point at each apple and say its number.');
  await creator.getByLabel('Kind of part').selectOption({ label: 'Practice question' });
  await creator.getByRole('button', { name: 'Add part' }).click();
  await creator
    .getByLabel('Question', { exact: true })
    .selectOption({ label: 'How many apples are there?' });
  await creator.getByRole('button', { name: 'Save draft' }).click();
  await expect(creator.getByRole('heading', { name: 'Edit lesson' })).toBeVisible();
  await creator.getByRole('button', { name: 'Send for review' }).click();
  await expect(version(creator)).toContainText('In review');

  // The reviewer sends it back with a note.
  await reviewer.goto('/content');
  await reviewer
    .getByTestId('review-queue')
    .getByRole('link', { name: /Counting apples/ })
    .click();
  await reviewer.getByRole('button', { name: 'Send back' }).click();
  await reviewer
    .getByLabel('Why is it going back? The author will see this.')
    .fill('Please add a short description.');
  await reviewer.getByRole('button', { name: 'Send back with this note' }).click();
  await expect(version(reviewer)).toContainText('Draft');

  // The creator sees the note, fixes the draft and sends it again.
  await creator.reload();
  await expect(version(creator)).toContainText('Please add a short description.');
  await creator.getByLabel('Short description (English)').fill('We count apples together.');
  await creator.getByRole('button', { name: 'Save draft' }).click();
  await expect(creator.getByText('Saved.')).toBeVisible();
  await creator.getByRole('button', { name: 'Send for review' }).click();
  await expect(version(creator)).toContainText('In review');

  await reviewer.goto('/content');
  await reviewer
    .getByTestId('review-queue')
    .getByRole('link', { name: /Counting apples/ })
    .click();
  await reviewer.getByRole('button', { name: 'Approve' }).click();
  await reviewer.getByRole('button', { name: 'Publish' }).click();
  await expect(version(reviewer)).toContainText('Live');
  await reviewerContext.close();

  // A child sees the lesson the studio published.
  const { code, username } = await setup.addChild(school);
  await childSignIn(creator, code, username);
  await creator.getByRole('link', { name: /Counting apples/ }).click();
  await expect(creator.getByText('We count apples together.')).toBeVisible();
  await expect(creator.getByText('How many apples are there?')).toBeVisible();
});

test('a published question changes only through a new draft version', async ({ page }) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');
  const school = await setup.school();
  const subjects = await setup.call<{ id: string; code: string }[]>(
    school.creator.token,
    'GET',
    '/curriculum/subjects',
  );
  const bank = await setup.call<{ id: string }>(school.creator.token, 'POST', '/question-banks', {
    subjectId: subjects.find((subject) => subject.code === 'MATH')?.id,
    title: { en: 'Facts' },
  });
  const question = await setup.call<{ id: string; versions: { id: string }[] }>(
    school.creator.token,
    'POST',
    `/question-banks/${bank.id}/questions`,
    {
      definition: {
        type: 'TRUE_FALSE',
        prompt: { en: 'Two is more than one.' },
        answer: { correct: true },
      },
    },
  );
  await setup.publish(school, 'question-versions', question);

  await staffSignIn(page, school.creator.email, school.name);
  await page.goto(`/content/questions/${question.id}`);
  await expect(page.getByText('This version is live.')).toBeVisible();
  await page.getByLabel('Question (English)').fill('Two is more than one, true or false?');
  await page.getByRole('button', { name: 'Save as a new draft version' }).click();
  await expect(page.getByTestId('version')).toHaveCount(2);
  await expect(version(page)).toContainText('Version 2 · written by you');
  await expect(version(page)).toContainText('Draft');
  await expect(page.getByTestId('version').nth(1)).toContainText('Live');
});

test('a creator builds a quiz and a path from published work, and a child gets both', async ({
  page,
}) => {
  test.skip(!listening, 'The SMTP port is in use, probably by Mailpit');
  const school = await setup.school();
  const token = school.creator.token;
  const subjects = await setup.call<{ id: string; code: string }[]>(
    token,
    'GET',
    '/curriculum/subjects',
  );
  const subjectId = subjects.find((subject) => subject.code === 'MATH')?.id;
  const bank = await setup.call<{ id: string }>(token, 'POST', '/question-banks', {
    subjectId,
    title: { en: 'Facts' },
  });
  for (const [prompt, correct] of [
    ['Two is more than one.', true],
    ['Five is less than three.', false],
  ] as const) {
    await setup.publish(
      school,
      'question-versions',
      await setup.call(token, 'POST', `/question-banks/${bank.id}/questions`, {
        definition: { type: 'TRUE_FALSE', prompt: { en: prompt }, answer: { correct } },
      }),
    );
  }
  await setup.publish(
    school,
    'lesson-versions',
    await setup.call(token, 'POST', '/lessons', {
      subjectId,
      content: {
        title: { en: 'Bigger and smaller' },
        estimatedMinutes: 5,
        blocks: [{ id: 'intro', type: 'TEXT', body: { en: 'Some numbers are bigger.' } }],
      },
    }),
  );

  await staffSignIn(page, school.creator.email, school.name);
  await page.goto('/content/quizzes/new');
  await page.getByLabel('Subject').selectOption({ label: 'Mathematics' });
  await page.getByLabel('Title (English)').fill('Number facts');
  await page.getByLabel('Pass mark (%)').fill('50');
  await page.getByLabel('Tries allowed').fill('2');
  for (const prompt of ['Two is more than one.', 'Five is less than three.']) {
    await page.getByLabel('Add a question').selectOption({ label: prompt });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await page.getByTestId('quiz-item').nth(1).getByLabel('Points').fill('2');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('heading', { name: 'Edit quiz' })).toBeVisible();
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(version(page)).toContainText('In review');
  const quizId = page.url().split('/').pop() as string;

  await page.goto('/content/paths/new');
  await page.getByLabel('Subject').selectOption({ label: 'Mathematics' });
  await page.getByLabel('Title (English)').first().fill('Comparing numbers');
  await page.getByTestId('path-unit').getByLabel('Title (English)').fill('Start here');
  await page.getByLabel('Add a lesson').selectOption({ label: 'Bigger and smaller' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('heading', { name: 'Edit learning path' })).toBeVisible();
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(version(page)).toContainText('In review');
  const pathId = page.url().split('/').pop() as string;

  // The reviewer publishes both, here through the API, as the first journey covers the screens.
  for (const [base, versions, id] of [
    ['assessments', 'assessment-versions', quizId],
    ['learning-paths', 'learning-path-versions', pathId],
  ] as const) {
    const view = await setup.call<{ versions: { id: string }[] }>(
      school.reviewer.token,
      'GET',
      `/${base}/${id}`,
    );
    for (const action of ['approve', 'publish']) {
      await setup.call(
        school.reviewer.token,
        'POST',
        `/${versions}/${view.versions[0]?.id}/transitions`,
        { action },
      );
    }
  }

  const { code, username } = await setup.addChild(school);
  await childSignIn(page, code, username);
  await page.getByRole('link', { name: /Comparing numbers/ }).click();
  await expect(page.getByTestId('path-lesson')).toContainText('Bigger and smaller');
  await page.goto(`/play/quizzes/${quizId}`);
  await expect(page.getByText('Questions: 2')).toBeVisible();
  await expect(page.getByText('Tries used: 0 of 2')).toBeVisible();
});
