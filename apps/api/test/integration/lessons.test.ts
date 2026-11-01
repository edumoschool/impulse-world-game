import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuthResult,
  ERROR_CODES,
  type LearnerLesson,
  type LearnerLessonSummary,
  type LessonContent,
  type LessonView,
  type QuestionBankView,
  type QuestionView,
  type SubjectView,
} from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { bearer, createSchool, joinAs, type School } from '../support/schools.js';
import {
  CHILD_PASSCODE,
  childPayload,
  createTestApp,
  dataOf,
  type TestApp,
  url,
} from '../support/test-app.js';

let ctx: TestApp;
let system: SystemDatabase;

beforeAll(async () => {
  ctx = await createTestApp();
  system = ctx.app.get(SystemDatabase);
});
afterAll(() => ctx.close());

const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;
const step = (token: string, path: string, versionId: string, action: string) =>
  ctx
    .http()
    .post(url(`/${path}/${versionId}/transitions`))
    .set(bearer(token))
    .send({ action });

interface Classroom extends School {
  creator: string;
  reviewer: string;
  learner: string;
  subjectId: string;
  bankId: string;
}

/** A school with a creator, a reviewer, a signed-in child, and a maths question bank. */
async function classroom(): Promise<Classroom> {
  const school = await createSchool(ctx);
  const creator = (await joinAs(ctx, school, 'CONTENT_CREATOR')).token;
  const reviewer = (await joinAs(ctx, school, 'CONTENT_REVIEWER')).token;
  const payload = childPayload();
  await ctx.http().post(url('/children')).set(bearer(school.token)).send(payload).expect(201);
  const session = dataOf<AuthResult>(
    await ctx.http().get(url('/auth/session')).set(bearer(school.token)).expect(200),
  );
  const loginCode = session.tenants.find((t) => t.tenantId === school.tenantId)?.loginCode;
  const child = dataOf<AuthResult>(
    await ctx
      .http()
      .post(url('/auth/child/login'))
      .send({
        loginCode,
        username: payload.username,
        passcode: CHILD_PASSCODE,
        transport: 'bearer',
      })
      .expect(200),
  );
  const subjects = dataOf<SubjectView[]>(
    await ctx.http().get(url('/curriculum/subjects')).set(bearer(creator)).expect(200),
  );
  const subjectId = (subjects.find((s) => s.code === 'MATH') as SubjectView).id;
  const bank = dataOf<QuestionBankView>(
    await ctx
      .http()
      .post(url('/question-banks'))
      .set(bearer(creator))
      .send({ subjectId, title: { en: 'Counting' } })
      .expect(201),
  );
  return {
    ...school,
    creator,
    reviewer,
    learner: child.accessToken as string,
    subjectId,
    bankId: bank.id,
  };
}

const question = (prompt: string) => ({
  type: 'MULTIPLE_CHOICE',
  prompt: { en: prompt },
  options: [
    { id: 'a', text: { en: '2' } },
    { id: 'b', text: { en: '3' } },
  ],
  answer: { correctOptionId: 'b' },
});

/** Creates a question, and publishes it unless told not to. Returns its version id. */
async function questionVersion(c: Classroom, prompt = 'How many apples?', publish = true) {
  const created = dataOf<QuestionView>(
    await ctx
      .http()
      .post(url(`/question-banks/${c.bankId}/questions`))
      .set(bearer(c.creator))
      .send({ definition: question(prompt) })
      .expect(201),
  );
  const versionId = created.versions[0]?.id as string;
  if (publish) {
    await step(c.creator, 'question-versions', versionId, 'submit').expect(200);
    await step(c.reviewer, 'question-versions', versionId, 'approve').expect(200);
    await step(c.reviewer, 'question-versions', versionId, 'publish').expect(200);
  }
  return { questionId: created.id, versionId };
}

const lessonContent = (questionVersionId: string): LessonContent => ({
  title: { en: 'Counting to three', uz: 'Uchgacha sanash' },
  estimatedMinutes: 5,
  blocks: [
    { id: 'intro', type: 'TEXT', body: { en: 'Let us count together.' } },
    {
      id: 'picture',
      type: 'IMAGE',
      asset: 'images/apples.png',
      alt: { en: 'Three red apples on a table' },
    },
    { id: 'check', type: 'QUESTION', questionVersionId },
  ],
});

async function createLesson(c: Classroom, content: LessonContent) {
  return dataOf<LessonView>(
    await ctx
      .http()
      .post(url('/lessons'))
      .set(bearer(c.creator))
      .send({ subjectId: c.subjectId, content })
      .expect(201),
  );
}

async function publishLesson(c: Classroom, lesson: LessonView) {
  const versionId = lesson.versions[0]?.id as string;
  await step(c.creator, 'lesson-versions', versionId, 'submit').expect(200);
  await step(c.reviewer, 'lesson-versions', versionId, 'approve').expect(200);
  await step(c.reviewer, 'lesson-versions', versionId, 'publish').expect(200);
  return versionId;
}

describe('lessons', () => {
  it('go through review and reach learners without any answer key', async () => {
    const c = await classroom();
    const { versionId } = await questionVersion(c);
    const lesson = await createLesson(c, lessonContent(versionId));

    const list = async () =>
      dataOf<LearnerLessonSummary[]>(
        await ctx.http().get(url('/learn/lessons')).set(bearer(c.learner)).expect(200),
      ).map((entry) => entry.lessonId);
    expect(await list()).not.toContain(lesson.id);
    await ctx
      .http()
      .get(url(`/learn/lessons/${lesson.id}`))
      .set(bearer(c.learner))
      .expect(404);

    await publishLesson(c, lesson);
    expect(await list()).toContain(lesson.id);

    const response = await ctx
      .http()
      .get(url(`/learn/lessons/${lesson.id}`))
      .set(bearer(c.learner))
      .expect(200);
    const delivered = dataOf<LearnerLesson>(response);
    expect(delivered.blocks.map((block) => block.type)).toEqual(['TEXT', 'IMAGE', 'QUESTION']);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('"answer"');
    expect(raw).not.toContain('correctOptionId');
  });

  it('cannot go to review while a question in it is unpublished', async () => {
    const c = await classroom();
    const { versionId } = await questionVersion(c, 'Draft question', false);
    const lesson = await createLesson(c, lessonContent(versionId));
    const refused = await step(
      c.creator,
      'lesson-versions',
      lesson.versions[0]?.id as string,
      'submit',
    ).expect(409);
    expect(errorCode(refused)).toBe(ERROR_CODES.QUESTION_NOT_PUBLISHED);
    expect(refused.body.error.details.questionVersionIds).toEqual([versionId]);
  });

  it('keeps showing the question version it was published with', async () => {
    const c = await classroom();
    const { questionId, versionId } = await questionVersion(c, 'How many apples?');
    const lesson = await createLesson(c, lessonContent(versionId));
    await publishLesson(c, lesson);

    // The question moves on to version 2, and version 1 is archived.
    const revised = dataOf<QuestionView>(
      await ctx
        .http()
        .put(url(`/questions/${questionId}/draft`))
        .set(bearer(c.creator))
        .send({ definition: question('How many pears?') })
        .expect(200),
    );
    const second = revised.versions[0]?.id as string;
    await step(c.creator, 'question-versions', second, 'submit').expect(200);
    await step(c.reviewer, 'question-versions', second, 'approve').expect(200);
    await step(c.reviewer, 'question-versions', second, 'publish').expect(200);

    const delivered = dataOf<LearnerLesson>(
      await ctx
        .http()
        .get(url(`/learn/lessons/${lesson.id}`))
        .set(bearer(c.learner))
        .expect(200),
    );
    const block = delivered.blocks[2];
    expect(block?.type === 'QUESTION' && block.question.prompt.en).toBe('How many apples?');
  });

  it('requires text alternatives for media, and real question versions', async () => {
    const c = await classroom();
    const { versionId } = await questionVersion(c);
    const content = lessonContent(versionId);
    const noAlt = {
      ...content,
      blocks: [{ id: 'picture', type: 'IMAGE', asset: 'images/apples.png' }],
    };
    await ctx
      .http()
      .post(url('/lessons'))
      .set(bearer(c.creator))
      .send({ subjectId: c.subjectId, content: noAlt })
      .expect(400);
    await ctx
      .http()
      .post(url('/lessons'))
      .set(bearer(c.creator))
      .send({ subjectId: c.subjectId, content: lessonContent(crypto.randomUUID()) })
      .expect(404);
  });

  it('keeps authoring and delivery apart, and schools apart', async () => {
    const mine = await classroom();
    const theirs = await classroom();
    const { versionId } = await questionVersion(mine);
    const lesson = await createLesson(mine, lessonContent(versionId));
    await publishLesson(mine, lesson);

    // Learners cannot reach drafts or answer keys through authoring routes.
    await ctx.http().get(url('/lessons')).set(bearer(mine.learner)).expect(403);
    await ctx
      .http()
      .get(url(`/lessons/${lesson.id}`))
      .set(bearer(mine.learner))
      .expect(403);
    // Authoring staff are not learners.
    await ctx.http().get(url('/learn/lessons')).set(bearer(mine.creator)).expect(403);
    // Another school's learner and authors see nothing of it.
    await ctx
      .http()
      .get(url(`/learn/lessons/${lesson.id}`))
      .set(bearer(theirs.learner))
      .expect(404);
    await ctx
      .http()
      .get(url(`/lessons/${lesson.id}`))
      .set(bearer(theirs.creator))
      .expect(404);
    // Nor can another school's lesson use this school's question.
    await ctx
      .http()
      .post(url('/lessons'))
      .set(bearer(theirs.creator))
      .send({ subjectId: theirs.subjectId, content: lessonContent(versionId) })
      .expect(404);
  });

  it('is frozen by the database once it leaves draft', async () => {
    const c = await classroom();
    const { versionId } = await questionVersion(c);
    const lesson = await createLesson(c, lessonContent(versionId));
    const lessonVersionId = await publishLesson(c, lesson);
    await expect(
      system.client.lessonVersion.update({
        where: { id: lessonVersionId },
        data: { content: { ...lessonContent(versionId), estimatedMinutes: 99 } },
      }),
    ).rejects.toThrow();
  });
});
