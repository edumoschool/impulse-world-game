import { type APIRequestContext, expect, request, test } from '@playwright/test';
import { MailSink } from './support/mail-sink';
import { childSignIn, SchoolApi, type Versioned } from './support/school-api';

/**
 * Stage 3 acceptance: a learner completes a lesson and an assessment in the web app. Staff set
 * up and publish the content through the API, since the authoring screens come later.
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

/** Publishes a lesson, a two-question quiz and a path, and adds a child who can sign in. */
async function classroom() {
  const s = await setup.school();
  const subjects = await setup.call<{ id: string; code: string }[]>(
    s.creator.token,
    'GET',
    '/curriculum/subjects',
  );
  const subjectId = subjects.find((subject) => subject.code === 'MATH')?.id;
  const bank = await setup.call<{ id: string }>(s.creator.token, 'POST', '/question-banks', {
    subjectId,
    title: { en: 'Counting' },
  });
  const question = async (definition: object) =>
    setup.publish(
      s,
      'question-versions',
      await setup.call<Versioned>(s.creator.token, 'POST', `/question-banks/${bank.id}/questions`, {
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
  const lesson = await setup.call<Versioned>(s.creator.token, 'POST', '/lessons', {
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
  await setup.publish(s, 'lesson-versions', lesson);
  const quiz = await setup.call<Versioned>(s.creator.token, 'POST', '/assessments', {
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
  await setup.publish(s, 'assessment-versions', quiz);
  const path = await setup.call<Versioned>(s.creator.token, 'POST', '/learning-paths', {
    subjectId,
    content: {
      title: { en: 'Numbers to ten' },
      units: [{ id: 'start', title: { en: 'Counting' }, lessonIds: [lesson.id] }],
    },
  });
  await setup.publish(s, 'learning-path-versions', path);

  return setup.addChild(s);
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
