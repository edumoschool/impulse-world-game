import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuthResult,
  ERROR_CODES,
  type AssessmentContentInput,
  type AssessmentView,
  type LearnerAssessmentSummary,
  type LearnerAttempt,
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

/** Adds a child to the school and signs them in. Returns their access token. */
async function signInChild(school: School): Promise<string> {
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
  return child.accessToken as string;
}

/** A school with a creator, a reviewer, a signed-in child, and a maths question bank. */
async function classroom(): Promise<Classroom> {
  const school = await createSchool(ctx);
  const creator = (await joinAs(ctx, school, 'CONTENT_CREATOR')).token;
  const reviewer = (await joinAs(ctx, school, 'CONTENT_REVIEWER')).token;
  const learner = await signInChild(school);
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
    learner,
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

const content = (
  items: { id: string; questionVersionId: string; points?: number }[],
  extra: Partial<AssessmentContentInput> = {},
): AssessmentContentInput => ({
  title: { en: 'Counting check', uz: 'Sanash tekshiruvi' },
  items,
  passingScore: 0.6,
  ...extra,
});

async function createAssessment(c: Classroom, body: AssessmentContentInput) {
  return dataOf<AssessmentView>(
    await ctx
      .http()
      .post(url('/assessments'))
      .set(bearer(c.creator))
      .send({ subjectId: c.subjectId, content: body })
      .expect(201),
  );
}

async function publishAssessment(c: Classroom, assessment: AssessmentView) {
  const versionId = assessment.versions[0]?.id as string;
  await step(c.creator, 'assessment-versions', versionId, 'submit').expect(200);
  await step(c.reviewer, 'assessment-versions', versionId, 'approve').expect(200);
  await step(c.reviewer, 'assessment-versions', versionId, 'publish').expect(200);
  return versionId;
}

/** A published assessment of two questions: the first worth 2 points, the second 1. */
async function readyAssessment(c: Classroom, extra: Partial<AssessmentContentInput> = {}) {
  const first = await questionVersion(c, 'How many apples?');
  const second = await questionVersion(c, 'How many pears?');
  const assessment = await createAssessment(
    c,
    content(
      [
        { id: 'apples', questionVersionId: first.versionId, points: 2 },
        { id: 'pears', questionVersionId: second.versionId },
      ],
      extra,
    ),
  );
  const versionId = await publishAssessment(c, assessment);
  return { assessment, versionId, first, second };
}

const start = (token: string, assessmentId: string) =>
  ctx
    .http()
    .post(url(`/learn/assessments/${assessmentId}/attempts`))
    .set(bearer(token));
const answer = (token: string, attemptId: string, itemId: string, optionId: string) =>
  ctx
    .http()
    .put(url(`/learn/attempts/${attemptId}/responses/${itemId}`))
    .set(bearer(token))
    .send({ response: { type: 'MULTIPLE_CHOICE', optionId } });
const submit = (token: string, attemptId: string) =>
  ctx
    .http()
    .post(url(`/learn/attempts/${attemptId}/submit`))
    .set(bearer(token));

describe('assessments', () => {
  it('are taken and scored on the server, without the answer key ever reaching the learner', async () => {
    const c = await classroom();
    const { assessment, versionId } = await readyAssessment(c);

    const listed = dataOf<LearnerAssessmentSummary[]>(
      await ctx.http().get(url('/learn/assessments')).set(bearer(c.learner)).expect(200),
    ).find((entry) => entry.assessmentId === assessment.id);
    expect(listed).toMatchObject({ versionId, itemCount: 2, attemptsUsed: 0, maxAttempts: null });

    const started = await start(c.learner, assessment.id).expect(200);
    expect(JSON.stringify(started.body)).not.toContain('correctOptionId');
    const attempt = dataOf<LearnerAttempt>(started);
    expect(attempt).toMatchObject({ state: 'IN_PROGRESS', versionId, result: null });

    // Saving says nothing about correctness, and an answer can be changed until submission.
    const saved = await answer(c.learner, attempt.attemptId, 'apples', 'a').expect(200);
    expect(Object.keys(saved.body.data).sort()).toEqual(['itemId', 'savedAt']);
    await answer(c.learner, attempt.attemptId, 'apples', 'b').expect(200);
    await answer(c.learner, attempt.attemptId, 'pears', 'a').expect(200);

    const submitted = await submit(c.learner, attempt.attemptId).expect(200);
    expect(JSON.stringify(submitted.body)).not.toContain('correctOptionId');
    const result = dataOf<LearnerAttempt>(submitted).result;
    expect(result).toMatchObject({
      earnedPoints: 2,
      maxPoints: 3,
      score: 0.6667,
      passed: true,
      pendingReview: 0,
    });
    expect(result?.items.map((item) => item.outcome)).toEqual(['CORRECT', 'INCORRECT']);

    // The scored attempt and its event committed together.
    const events = await system.client.outboxEvent.findMany({
      where: { type: 'assessment.submitted', aggregateId: attempt.attemptId },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ assessmentVersionId: versionId, score: 0.6667 });

    // Submitting again returns the same result, and the attempt is closed to new answers.
    const again = dataOf<LearnerAttempt>(await submit(c.learner, attempt.attemptId).expect(200));
    expect(again.result).toEqual(result);
    const closed = await answer(c.learner, attempt.attemptId, 'pears', 'b').expect(409);
    expect(errorCode(closed)).toBe(ERROR_CODES.ATTEMPT_CLOSED);
    expect(
      await system.client.outboxEvent.count({
        where: { type: 'assessment.submitted', aggregateId: attempt.attemptId },
      }),
    ).toBe(1);
  });

  it('records unanswered items, resumes the open attempt, and enforces the attempt limit', async () => {
    const c = await classroom();
    const { assessment } = await readyAssessment(c, { maxAttempts: 1 });

    // Two taps at once still give one attempt.
    const [one, two] = await Promise.all([
      start(c.learner, assessment.id).expect(200),
      start(c.learner, assessment.id).expect(200),
    ]);
    const attemptId = dataOf<LearnerAttempt>(one).attemptId;
    expect(dataOf<LearnerAttempt>(two).attemptId).toBe(attemptId);

    await answer(c.learner, attemptId, 'pears', 'b').expect(200);
    const resumed = dataOf<LearnerAttempt>(await start(c.learner, assessment.id).expect(200));
    expect(resumed.attemptId).toBe(attemptId);
    expect(resumed.items[1]?.response).toEqual({ type: 'MULTIPLE_CHOICE', optionId: 'b' });

    const result = dataOf<LearnerAttempt>(await submit(c.learner, attemptId).expect(200)).result;
    expect(result?.items.map((item) => item.outcome)).toEqual(['UNANSWERED', 'CORRECT']);
    expect(result).toMatchObject({ earnedPoints: 1, score: 0.3333, passed: false });

    const refused = await start(c.learner, assessment.id).expect(409);
    expect(errorCode(refused)).toBe(ERROR_CODES.ATTEMPT_LIMIT_REACHED);
    const listed = dataOf<LearnerAssessmentSummary[]>(
      await ctx.http().get(url('/learn/assessments')).set(bearer(c.learner)).expect(200),
    ).find((entry) => entry.assessmentId === assessment.id);
    expect(listed).toMatchObject({ attemptsUsed: 1, maxAttempts: 1 });
  });

  it('marks an attempt against the versions it started on, and keeps its result after changes', async () => {
    const c = await classroom();
    const { assessment, versionId, first } = await readyAssessment(c);
    const attemptId = dataOf<LearnerAttempt>(
      await start(c.learner, assessment.id).expect(200),
    ).attemptId;

    // While the attempt is open, the first question changes its answer and the assessment
    // gets a new version with only that question.
    const revised = dataOf<QuestionView>(
      await ctx
        .http()
        .put(url(`/questions/${first.questionId}/draft`))
        .set(bearer(c.creator))
        .send({
          definition: { ...question('How many apples now?'), answer: { correctOptionId: 'a' } },
        })
        .expect(200),
    );
    const newQuestion = revised.versions[0]?.id as string;
    await step(c.creator, 'question-versions', newQuestion, 'submit').expect(200);
    await step(c.reviewer, 'question-versions', newQuestion, 'approve').expect(200);
    await step(c.reviewer, 'question-versions', newQuestion, 'publish').expect(200);
    const draft = dataOf<AssessmentView>(
      await ctx
        .http()
        .put(url(`/assessments/${assessment.id}/draft`))
        .set(bearer(c.creator))
        .send({ content: content([{ id: 'apples', questionVersionId: newQuestion }]) })
        .expect(200),
    );
    const newVersion = await publishAssessment(c, draft);

    // The open attempt still shows and marks the original question.
    const open = dataOf<LearnerAttempt>(
      await ctx
        .http()
        .get(url(`/learn/attempts/${attemptId}`))
        .set(bearer(c.learner))
        .expect(200),
    );
    expect(open.versionId).toBe(versionId);
    expect(open.items[0]?.question.prompt.en).toBe('How many apples?');
    await answer(c.learner, attemptId, 'apples', 'b').expect(200);
    await answer(c.learner, attemptId, 'pears', 'b').expect(200);
    const result = dataOf<LearnerAttempt>(await submit(c.learner, attemptId).expect(200)).result;
    expect(result).toMatchObject({ score: 1, passed: true });

    // A new attempt uses the new version.
    const next = dataOf<LearnerAttempt>(await start(c.learner, assessment.id).expect(200));
    expect(next.versionId).toBe(newVersion);
    expect(next.items.map((item) => item.questionVersionId)).toEqual([newQuestion]);

    // The first attempt reads back exactly as it was marked.
    const history = dataOf<LearnerAttempt>(
      await ctx
        .http()
        .get(url(`/learn/attempts/${attemptId}`))
        .set(bearer(c.learner))
        .expect(200),
    );
    expect(history.result).toEqual(result);
    expect(history.items[0]?.question.prompt.en).toBe('How many apples?');
  });

  it('refuses answers of the wrong type, unknown items, and unpublished questions', async () => {
    const c = await classroom();
    const { assessment } = await readyAssessment(c);
    const attemptId = dataOf<LearnerAttempt>(
      await start(c.learner, assessment.id).expect(200),
    ).attemptId;
    await ctx
      .http()
      .put(url(`/learn/attempts/${attemptId}/responses/apples`))
      .set(bearer(c.learner))
      .send({ response: { type: 'TRUE_FALSE', value: true } })
      .expect(400);
    await answer(c.learner, attemptId, 'nothing-here', 'a').expect(404);

    const draftQuestion = await questionVersion(c, 'Not ready yet', false);
    const unready = await createAssessment(
      c,
      content([{ id: 'one', questionVersionId: draftQuestion.versionId }]),
    );
    const refused = await step(
      c.creator,
      'assessment-versions',
      unready.versions[0]?.id as string,
      'submit',
    ).expect(409);
    expect(errorCode(refused)).toBe(ERROR_CODES.QUESTION_NOT_PUBLISHED);
  });

  it('keeps learners apart, schools apart, and authoring apart from taking', async () => {
    const mine = await classroom();
    const theirs = await classroom();
    const { assessment } = await readyAssessment(mine);
    const attemptId = dataOf<LearnerAttempt>(
      await start(mine.learner, assessment.id).expect(200),
    ).attemptId;

    // A classmate cannot read, answer or submit someone else's attempt.
    const classmate = await signInChild(mine);
    await ctx
      .http()
      .get(url(`/learn/attempts/${attemptId}`))
      .set(bearer(classmate))
      .expect(404);
    await answer(classmate, attemptId, 'apples', 'b').expect(404);
    await submit(classmate, attemptId).expect(404);

    // Another school sees nothing of it.
    await start(theirs.learner, assessment.id).expect(404);
    await ctx
      .http()
      .get(url(`/learn/attempts/${attemptId}`))
      .set(bearer(theirs.learner))
      .expect(404);
    await ctx
      .http()
      .get(url(`/assessments/${assessment.id}`))
      .set(bearer(theirs.creator))
      .expect(404);

    // Staff do not take assessments, and learners do not see authoring routes.
    await start(mine.creator, assessment.id).expect(403);
    await ctx.http().get(url('/assessments')).set(bearer(mine.learner)).expect(403);
    await ctx
      .http()
      .get(url(`/assessments/${assessment.id}`))
      .set(bearer(mine.learner))
      .expect(403);
  });

  it('is frozen by the database once submitted', async () => {
    const c = await classroom();
    const { assessment } = await readyAssessment(c);
    const attemptId = dataOf<LearnerAttempt>(
      await start(c.learner, assessment.id).expect(200),
    ).attemptId;
    await answer(c.learner, attemptId, 'apples', 'b').expect(200);
    await submit(c.learner, attemptId).expect(200);

    await expect(
      system.client.assessmentAttempt.update({ where: { id: attemptId }, data: { score: 1 } }),
    ).rejects.toThrow();
    await expect(
      system.client.assessmentResponse.updateMany({
        where: { attemptId },
        data: { score: 1, outcome: 'CORRECT' },
      }),
    ).rejects.toThrow();
    await expect(
      system.client.assessmentResponse.deleteMany({ where: { attemptId } }),
    ).rejects.toThrow();
  });
});
