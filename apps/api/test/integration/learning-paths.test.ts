import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuthResult,
  ERROR_CODES,
  type LearnerPath,
  type LearnerPathSummary,
  type LearningPathContent,
  type LearningPathView,
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

const pathContent = (lessonIds: string[]): LearningPathContent => ({
  title: { en: 'Numbers to ten', ru: 'Числа до десяти' },
  units: [
    { id: 'first', title: { en: 'First steps' }, lessonIds: lessonIds.slice(0, 1) },
    { id: 'next', title: { en: 'Next steps' }, lessonIds: lessonIds.slice(1) },
  ],
});

/** Two lessons, both published unless told otherwise. */
async function twoLessons(c: Classroom, publishSecond = true) {
  const { versionId } = await questionVersion(c);
  const first = await createLesson(c, lessonContent(versionId));
  await publishLesson(c, first);
  const second = await createLesson(c, lessonContent(versionId));
  if (publishSecond) {
    await publishLesson(c, second);
  }
  return [first.id, second.id];
}

async function createPath(c: Classroom, content: LearningPathContent) {
  return dataOf<LearningPathView>(
    await ctx
      .http()
      .post(url('/learning-paths'))
      .set(bearer(c.creator))
      .send({ subjectId: c.subjectId, content })
      .expect(201),
  );
}

async function publishPath(c: Classroom, path: LearningPathView) {
  const versionId = path.versions[0]?.id as string;
  await step(c.creator, 'learning-path-versions', versionId, 'submit').expect(200);
  await step(c.reviewer, 'learning-path-versions', versionId, 'approve').expect(200);
  await step(c.reviewer, 'learning-path-versions', versionId, 'publish').expect(200);
  return versionId;
}

const learnPath = async (c: Classroom, pathId: string) =>
  dataOf<LearnerPath>(
    await ctx
      .http()
      .get(url(`/learn/paths/${pathId}`))
      .set(bearer(c.learner))
      .expect(200),
  );

describe('learning paths', () => {
  it('go through review and reach learners as ordered units of live lessons', async () => {
    const c = await classroom();
    const lessonIds = await twoLessons(c);
    const path = await createPath(c, pathContent(lessonIds));
    expect(path.versions[0]?.state).toBe('DRAFT');

    const list = async () =>
      dataOf<LearnerPathSummary[]>(
        await ctx.http().get(url('/learn/paths')).set(bearer(c.learner)).expect(200),
      );
    expect((await list()).map((entry) => entry.learningPathId)).not.toContain(path.id);
    await ctx
      .http()
      .get(url(`/learn/paths/${path.id}`))
      .set(bearer(c.learner))
      .expect(404);

    // The author cannot publish their own path.
    const versionId = path.versions[0]?.id as string;
    await step(c.creator, 'learning-path-versions', versionId, 'submit').expect(200);
    const selfApproval = await step(c.creator, 'learning-path-versions', versionId, 'approve');
    expect(selfApproval.status).toBe(403);
    await step(c.reviewer, 'learning-path-versions', versionId, 'approve').expect(200);
    await step(c.reviewer, 'learning-path-versions', versionId, 'publish').expect(200);

    const summary = (await list()).find((entry) => entry.learningPathId === path.id);
    expect(summary).toMatchObject({ unitCount: 2, lessonCount: 2 });

    const delivered = await learnPath(c, path.id);
    expect(delivered.units.map((unit) => unit.id)).toEqual(['first', 'next']);
    expect(delivered.units.map((unit) => unit.lessons.map((l) => l.lessonId))).toEqual([
      [lessonIds[0]],
      [lessonIds[1]],
    ]);
  });

  it('cannot go to review while a lesson in it is unpublished', async () => {
    const c = await classroom();
    const lessonIds = await twoLessons(c, false);
    const path = await createPath(c, pathContent(lessonIds));
    const refused = await step(
      c.creator,
      'learning-path-versions',
      path.versions[0]?.id as string,
      'submit',
    ).expect(409);
    expect(errorCode(refused)).toBe(ERROR_CODES.LESSON_NOT_PUBLISHED);
    expect(refused.body.error.details.lessonIds).toEqual([lessonIds[1]]);
  });

  it('delivers the live version of each lesson, and leaves out lessons taken offline', async () => {
    const c = await classroom();
    const [firstId, secondId] = await twoLessons(c);
    const path = await createPath(c, pathContent([firstId as string, secondId as string]));
    await publishPath(c, path);

    // The first lesson gets a second version, and the second lesson is archived.
    const { versionId: questionVersionId } = await questionVersion(c, 'How many pears?');
    const revised = dataOf<LessonView>(
      await ctx
        .http()
        .put(url(`/lessons/${firstId}/draft`))
        .set(bearer(c.creator))
        .send({
          content: { ...lessonContent(questionVersionId), title: { en: 'Counting, revised' } },
        })
        .expect(200),
    );
    const newVersion = await publishLesson(c, revised);
    const second = dataOf<LessonView>(
      await ctx
        .http()
        .get(url(`/lessons/${secondId}`))
        .set(bearer(c.creator))
        .expect(200),
    );
    await step(c.reviewer, 'lesson-versions', second.versions[0]?.id as string, 'archive').expect(
      200,
    );

    const delivered = await learnPath(c, path.id);
    expect(delivered.units).toHaveLength(1);
    expect(delivered.units[0]?.lessons[0]).toMatchObject({
      lessonId: firstId,
      versionId: newVersion,
      title: { en: 'Counting, revised' },
    });
  });

  it('starts a new version for changes once published, and keeps the old one live until then', async () => {
    const c = await classroom();
    const lessonIds = await twoLessons(c);
    const path = await createPath(c, pathContent(lessonIds));
    const firstVersion = await publishPath(c, path);

    const reordered = { ...pathContent([...lessonIds].reverse()), title: { en: 'Reordered' } };
    const saved = dataOf<LearningPathView>(
      await ctx
        .http()
        .put(url(`/learning-paths/${path.id}/draft`))
        .set(bearer(c.creator))
        .send({ content: reordered })
        .expect(200),
    );
    expect(saved.versions.map((v) => [v.number, v.state])).toEqual([
      [2, 'DRAFT'],
      [1, 'PUBLISHED'],
    ]);
    expect((await learnPath(c, path.id)).versionId).toBe(firstVersion);

    // Another author cannot edit this draft.
    const otherAuthor = (await joinAs(ctx, c, 'CONTENT_CREATOR')).token;
    await ctx
      .http()
      .put(url(`/learning-paths/${path.id}/draft`))
      .set(bearer(otherAuthor))
      .send({ content: reordered })
      .expect(403);

    const secondVersion = await publishPath(c, saved);
    const delivered = await learnPath(c, path.id);
    expect(delivered.versionId).toBe(secondVersion);
    expect(delivered.title.en).toBe('Reordered');
    expect(delivered.units[0]?.lessons[0]?.lessonId).toBe(lessonIds[1]);
  });

  it('refuses unknown lessons and repeated lessons', async () => {
    const c = await classroom();
    const lessonIds = await twoLessons(c);
    const unknown = await ctx
      .http()
      .post(url('/learning-paths'))
      .set(bearer(c.creator))
      .send({
        subjectId: c.subjectId,
        content: pathContent([lessonIds[0] as string, crypto.randomUUID()]),
      })
      .expect(404);
    expect(errorCode(unknown)).toBe(ERROR_CODES.NOT_FOUND);
    await ctx
      .http()
      .post(url('/learning-paths'))
      .set(bearer(c.creator))
      .send({
        subjectId: c.subjectId,
        content: pathContent([lessonIds[0] as string, lessonIds[0] as string]),
      })
      .expect(400);
  });

  it('keeps authoring and delivery apart, and schools apart', async () => {
    const mine = await classroom();
    const theirs = await classroom();
    const lessonIds = await twoLessons(mine);
    const path = await createPath(mine, pathContent(lessonIds));
    await publishPath(mine, path);

    await ctx.http().get(url('/learning-paths')).set(bearer(mine.learner)).expect(403);
    await ctx
      .http()
      .get(url(`/learning-paths/${path.id}`))
      .set(bearer(mine.learner))
      .expect(403);
    await ctx.http().get(url('/learn/paths')).set(bearer(mine.creator)).expect(403);

    await ctx
      .http()
      .get(url(`/learn/paths/${path.id}`))
      .set(bearer(theirs.learner))
      .expect(404);
    const theirList = dataOf<LearnerPathSummary[]>(
      await ctx.http().get(url('/learn/paths')).set(bearer(theirs.learner)).expect(200),
    );
    expect(theirList.map((entry) => entry.learningPathId)).not.toContain(path.id);
    await ctx
      .http()
      .get(url(`/learning-paths/${path.id}`))
      .set(bearer(theirs.creator))
      .expect(404);
    await ctx
      .http()
      .put(url(`/learning-paths/${path.id}/draft`))
      .set(bearer(theirs.creator))
      .send({ content: pathContent(lessonIds) })
      .expect(404);
    // Nor can another school's path use this school's lessons.
    await ctx
      .http()
      .post(url('/learning-paths'))
      .set(bearer(theirs.creator))
      .send({ subjectId: theirs.subjectId, content: pathContent(lessonIds) })
      .expect(404);
  });

  it('is frozen by the database once it leaves draft', async () => {
    const c = await classroom();
    const lessonIds = await twoLessons(c);
    const path = await createPath(c, pathContent(lessonIds));
    const versionId = await publishPath(c, path);
    await expect(
      system.client.learningPathVersion.update({
        where: { id: versionId },
        data: { content: { ...pathContent(lessonIds), title: { en: 'Changed' } } },
      }),
    ).rejects.toThrow();
    await expect(
      system.client.learningPathVersion.update({
        where: { id: versionId },
        data: { state: 'DRAFT' },
      }),
    ).rejects.toThrow();
  });
});
