import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssessmentView,
  AuthResult,
  DomainEventEnvelope,
  LearnerAttempt,
  LearnerPath,
  LearnerProgress,
  LessonCompletionView,
  LessonView,
  LearningPathView,
  QuestionBankView,
  QuestionView,
  SkillView,
  SubjectView,
} from '@impulse/contracts';
import { NestFactory } from '@nestjs/core';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { EventDispatcher } from '../../src/infrastructure/events/event-consumer.js';
import { WorkerModule } from '../../src/worker.module.js';
import { bearer, createSchool, joinAs, type School } from '../support/schools.js';
import {
  CHILD_PASSCODE,
  childPayload,
  createTestApp,
  dataOf,
  registerAdult,
  type TestApp,
  unique,
  url,
} from '../support/test-app.js';

let ctx: TestApp;
let system: SystemDatabase;

beforeAll(async () => {
  ctx = await createTestApp();
  system = ctx.app.get(SystemDatabase);
});
afterAll(() => ctx.close());

const step = (token: string, path: string, versionId: string, action: string) =>
  ctx
    .http()
    .post(url(`/${path}/${versionId}/transitions`))
    .set(bearer(token))
    .send({ action });

/** Submit, approve and publish a version as the creator and reviewer. */
async function publish(c: Classroom, path: string, versionId: string) {
  await step(c.creator, path, versionId, 'submit').expect(200);
  await step(c.reviewer, path, versionId, 'approve').expect(200);
  await step(c.reviewer, path, versionId, 'publish').expect(200);
}

interface Child {
  childId: string;
  token: string;
}

/** Adds a child to a tenant as `adultToken`, and signs the child in. */
async function addChild(adultToken: string, tenantId: string): Promise<Child> {
  const payload = childPayload();
  const created = dataOf<{ id: string }>(
    await ctx.http().post(url('/children')).set(bearer(adultToken)).send(payload).expect(201),
  );
  const session = dataOf<AuthResult>(
    await ctx.http().get(url('/auth/session')).set(bearer(adultToken)).expect(200),
  );
  const loginCode = session.tenants.find((t) => t.tenantId === tenantId)?.loginCode;
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
  return { childId: created.id, token: child.accessToken as string };
}

interface Classroom extends School {
  creator: string;
  reviewer: string;
  child: Child;
  subjectId: string;
  bankId: string;
  skillId: string;
}

/** A school with authors, a signed-in child, a maths bank and one school skill. */
async function classroom(): Promise<Classroom> {
  const school = await createSchool(ctx);
  const creator = (await joinAs(ctx, school, 'CONTENT_CREATOR')).token;
  const reviewer = (await joinAs(ctx, school, 'CONTENT_REVIEWER')).token;
  const child = await addChild(school.token, school.tenantId);
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
  const skill = dataOf<SkillView>(
    await ctx
      .http()
      .post(url('/curriculum/skills'))
      .set(bearer(creator))
      .send({
        code: unique('COUNT')
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_'),
        subjectId,
        title: { en: 'Counting to ten' },
      })
      .expect(201),
  );
  return { ...school, creator, reviewer, child, subjectId, bankId: bank.id, skillId: skill.id };
}

/** A published multiple choice question on the class skill, where "b" is right. */
async function skillQuestion(c: Classroom, prompt: string): Promise<string> {
  const created = dataOf<QuestionView>(
    await ctx
      .http()
      .post(url(`/question-banks/${c.bankId}/questions`))
      .set(bearer(c.creator))
      .send({
        skillIds: [c.skillId],
        definition: {
          type: 'MULTIPLE_CHOICE',
          prompt: { en: prompt },
          options: [
            { id: 'a', text: { en: '2' } },
            { id: 'b', text: { en: '3' } },
          ],
          answer: { correctOptionId: 'b' },
        },
      })
      .expect(201),
  );
  const versionId = created.versions[0]?.id as string;
  await publish(c, 'question-versions', versionId);
  return versionId;
}

async function publishedLesson(c: Classroom, title: string): Promise<string> {
  const lesson = dataOf<LessonView>(
    await ctx
      .http()
      .post(url('/lessons'))
      .set(bearer(c.creator))
      .send({
        subjectId: c.subjectId,
        content: {
          title: { en: title },
          estimatedMinutes: 5,
          blocks: [{ id: 'intro', type: 'TEXT', body: { en: 'Let us count.' } }],
        },
      })
      .expect(201),
  );
  await publish(c, 'lesson-versions', lesson.versions[0]?.id as string);
  return lesson.id;
}

const progressOf = async (token: string) =>
  dataOf<LearnerProgress>(
    await ctx.http().get(url('/learn/progress')).set(bearer(token)).expect(200),
  );

/** Delivers the attempt's assessment.submitted event, as the worker would after the relay. */
async function deliverSubmission(attemptId: string) {
  const row = await system.client.outboxEvent.findFirstOrThrow({
    where: { type: 'assessment.submitted', aggregateId: attemptId },
  });
  const envelope: DomainEventEnvelope = {
    id: row.id,
    type: 'assessment.submitted',
    version: row.version,
    aggregateId: row.aggregateId,
    tenantId: row.tenantId,
    occurredAt: row.occurredAt.toISOString(),
    correlationId: row.correlationId,
    payload: row.payload as DomainEventEnvelope['payload'],
  };
  await ctx.app.get(EventDispatcher).dispatch(envelope);
}

/** Takes the assessment once, choosing the given option per item (null leaves it blank). */
async function takeAssessment(c: Classroom, assessmentId: string, choices: (string | null)[]) {
  const attempt = dataOf<LearnerAttempt>(
    await ctx
      .http()
      .post(url(`/learn/assessments/${assessmentId}/attempts`))
      .set(bearer(c.child.token))
      .expect(200),
  );
  for (const [index, optionId] of choices.entries()) {
    if (optionId) {
      await ctx
        .http()
        .put(url(`/learn/attempts/${attempt.attemptId}/responses/${attempt.items[index]?.id}`))
        .set(bearer(c.child.token))
        .send({ response: { type: 'MULTIPLE_CHOICE', optionId } })
        .expect(200);
    }
  }
  await ctx
    .http()
    .post(url(`/learn/attempts/${attempt.attemptId}/submit`))
    .set(bearer(c.child.token))
    .expect(200);
  return attempt.attemptId;
}

describe('learning progress', () => {
  it('registers the progress consumer in the API and in the worker process', async () => {
    const name = 'learning-progress.assessment-evidence';
    expect(ctx.app.get(EventDispatcher).consumerNames()).toContain(name);
    // The worker loads fewer modules than the API, so it must resolve on its own too.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      expect(worker.get(EventDispatcher).consumerNames()).toContain(name);
    } finally {
      await worker.close();
    }
  });

  it('records a lesson completion once, on the live version, and never as mastery', async () => {
    const c = await classroom();
    const lessonId = await publishedLesson(c, 'Counting');
    const complete = () =>
      ctx
        .http()
        .post(url(`/learn/lessons/${lessonId}/complete`))
        .set(bearer(c.child.token))
        .expect(200);
    const first = dataOf<LessonCompletionView>(await complete());
    const second = dataOf<LessonCompletionView>(await complete());
    expect(second).toEqual(first);

    const events = await system.client.outboxEvent.count({
      where: { type: 'lesson.completed', payload: { path: ['lessonId'], equals: lessonId } },
    });
    expect(events).toBe(1);
    const progress = await progressOf(c.child.token);
    expect(progress.completedLessons).toEqual([first]);
    expect(progress.skills).toEqual([]);

    await ctx
      .http()
      .post(url(`/learn/lessons/${crypto.randomUUID()}/complete`))
      .set(bearer(c.child.token))
      .expect(404);
  });

  it('builds mastery from several scored attempts, and lets it fall back', async () => {
    const c = await classroom();
    const items = [];
    for (const prompt of ['One?', 'Two?', 'Three?']) {
      items.push({
        id: prompt.toLowerCase().replace('?', ''),
        questionVersionId: await skillQuestion(c, prompt),
      });
    }
    const assessment = dataOf<AssessmentView>(
      await ctx
        .http()
        .post(url('/assessments'))
        .set(bearer(c.creator))
        .send({
          subjectId: c.subjectId,
          content: { title: { en: 'Counting check' }, items, passingScore: 0.5 },
        })
        .expect(201),
    );
    await publish(c, 'assessment-versions', assessment.versions[0]?.id as string);
    const skill = async () =>
      (await progressOf(c.child.token)).skills.find((entry) => entry.skillId === c.skillId);

    // Three right answers in one sitting: good, but not mastered.
    const first = await takeAssessment(c, assessment.id, ['b', 'b', 'b']);
    expect(await skill()).toBeUndefined();
    await deliverSubmission(first);
    expect(await skill()).toMatchObject({
      level: 'PROFICIENT',
      observationCount: 3,
      recentAccuracy: 1,
    });

    // The same again in a second sitting reaches mastery. A redelivered event changes nothing.
    const second = await takeAssessment(c, assessment.id, ['b', 'b', 'b']);
    await deliverSubmission(second);
    await deliverSubmission(second);
    expect(await skill()).toMatchObject({ level: 'MASTERED', observationCount: 6 });

    // Two wrong answers and one left blank: the blank is not evidence, the wrong ones pull the
    // recent accuracy to 6 of 8.
    const third = await takeAssessment(c, assessment.id, ['a', 'a', null]);
    await deliverSubmission(third);
    expect(await skill()).toMatchObject({
      level: 'PROFICIENT',
      observationCount: 8,
      recentAccuracy: 0.75,
    });

    // Evidence is append-only, even for the system role.
    await expect(
      system.client.skillObservation.updateMany({
        where: { learnerId: { not: '' }, skillId: c.skillId },
        data: { score: 1 },
      }),
    ).rejects.toThrow();
  });

  it('shows in a path which lessons are finished and which are still locked', async () => {
    const c = await classroom();
    const lessonIds = [
      await publishedLesson(c, 'First'),
      await publishedLesson(c, 'Second'),
      await publishedLesson(c, 'Third'),
    ];
    const path = dataOf<LearningPathView>(
      await ctx
        .http()
        .post(url('/learning-paths'))
        .set(bearer(c.creator))
        .send({
          subjectId: c.subjectId,
          content: {
            title: { en: 'Counting path' },
            units: [
              { id: 'one', title: { en: 'One' }, lessonIds: lessonIds.slice(0, 2) },
              { id: 'two', title: { en: 'Two' }, lessonIds: lessonIds.slice(2) },
            ],
          },
        })
        .expect(201),
    );
    await publish(c, 'learning-path-versions', path.versions[0]?.id as string);
    const flags = async () =>
      dataOf<LearnerPath>(
        await ctx
          .http()
          .get(url(`/learn/paths/${path.id}`))
          .set(bearer(c.child.token))
          .expect(200),
      ).units.flatMap((unit) => unit.lessons.map((l) => [l.completed, l.locked]));

    expect(await flags()).toEqual([
      [false, false],
      [false, true],
      [false, true],
    ]);
    await ctx
      .http()
      .post(url(`/learn/lessons/${lessonIds[0]}/complete`))
      .set(bearer(c.child.token))
      .expect(200);
    expect(await flags()).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('shows a child its own progress, and guardians and permitted staff the child’s', async () => {
    const c = await classroom();
    const lessonId = await publishedLesson(c, 'Counting');
    await ctx
      .http()
      .post(url(`/learn/lessons/${lessonId}/complete`))
      .set(bearer(c.child.token))
      .expect(200);
    const childProgress = (token: string) =>
      ctx
        .http()
        .get(url(`/children/${c.child.childId}/progress`))
        .set(bearer(token));

    // School staff who see all children can; content staff cannot, nor can another school.
    const seen = dataOf<LearnerProgress>(await childProgress(c.token).expect(200));
    expect(seen.completedLessons.map((entry) => entry.lessonId)).toEqual([lessonId]);
    await childProgress(c.creator).expect(404);
    await childProgress((await createSchool(ctx)).token).expect(404);
    // A classmate does not see it, and has none of it in their own progress.
    const classmate = await addChild(c.token, c.tenantId);
    await childProgress(classmate.token).expect(404);
    expect((await progressOf(classmate.token)).completedLessons).toEqual([]);
    // Staff have no learner progress of their own.
    await ctx.http().get(url('/learn/progress')).set(bearer(c.creator)).expect(403);

    // In a family, the guardian sees their child's progress and another family does not.
    const parent = await registerAdult(ctx);
    const kid = await addChild(parent.accessToken, parent.tenantId);
    const own = await ctx
      .http()
      .get(url(`/children/${kid.childId}/progress`))
      .set(bearer(parent.accessToken))
      .expect(200);
    expect(dataOf<LearnerProgress>(own)).toEqual({ completedLessons: [], skills: [] });
    const stranger = await registerAdult(ctx);
    await ctx
      .http()
      .get(url(`/children/${kid.childId}/progress`))
      .set(bearer(stranger.accessToken))
      .expect(404);
  });
});
