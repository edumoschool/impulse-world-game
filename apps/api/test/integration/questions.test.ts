import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  type QuestionBankView,
  type QuestionDefinition,
  type QuestionVersionView,
  type QuestionView,
  type SubjectView,
} from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { TenantDatabase } from '../../src/infrastructure/database/tenant-database.js';
import {
  bearer,
  createSchool,
  invitationTokenFrom,
  joinAs,
  type School,
} from '../support/schools.js';
import { createTestApp, dataOf, type TestApp, url } from '../support/test-app.js';

let ctx: TestApp;
let system: SystemDatabase;

beforeAll(async () => {
  ctx = await createTestApp();
  system = ctx.app.get(SystemDatabase);
});
afterAll(() => ctx.close());

const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;

const multipleChoice = (prompt = 'What is 2 + 2?'): QuestionDefinition => ({
  type: 'MULTIPLE_CHOICE',
  prompt: { en: prompt, uz: '2 + 2 nechaga teng?' },
  options: [
    { id: 'a', text: { en: '3' } },
    { id: 'b', text: { en: '4' } },
  ],
  answer: { correctOptionId: 'b' },
});

interface Studio extends School {
  creator: string;
  creatorEmail: string;
  reviewer: string;
  bankId: string;
}

/** A school with a creator, a separate reviewer and a maths question bank. */
async function studio(): Promise<Studio> {
  const school = await createSchool(ctx);
  const { token: creator, adult } = await joinAs(ctx, school, 'CONTENT_CREATOR');
  const reviewer = (await joinAs(ctx, school, 'CONTENT_REVIEWER')).token;
  const subjects = dataOf<SubjectView[]>(
    await ctx.http().get(url('/curriculum/subjects')).set(bearer(creator)).expect(200),
  );
  const math = subjects.find((subject) => subject.code === 'MATH') as SubjectView;
  const bank = dataOf<QuestionBankView>(
    await ctx
      .http()
      .post(url('/question-banks'))
      .set(bearer(creator))
      .send({ subjectId: math.id, title: { en: 'Addition' } })
      .expect(201),
  );
  return { ...school, creator, creatorEmail: adult.email, reviewer, bankId: bank.id };
}

async function newQuestion(s: Studio, definition = multipleChoice()) {
  return dataOf<QuestionView>(
    await ctx
      .http()
      .post(url(`/question-banks/${s.bankId}/questions`))
      .set(bearer(s.creator))
      .send({ definition })
      .expect(201),
  );
}

const step = (token: string, versionId: string, action: string, reason?: string) =>
  ctx
    .http()
    .post(url(`/question-versions/${versionId}/transitions`))
    .set(bearer(token))
    .send({ action, reason });

const latest = (question: QuestionView) => question.versions[0] as QuestionVersionView;

describe('question review workflow', () => {
  it('goes from draft to published with an independent reviewer, and announces it', async () => {
    const s = await studio();
    const question = await newQuestion(s);
    const version = latest(question);
    expect(version).toMatchObject({ number: 1, state: 'DRAFT' });

    await step(s.creator, version.id, 'submit').expect(200);
    // A creator has no review rights at all.
    await step(s.creator, version.id, 'approve').expect(403);
    await step(s.reviewer, version.id, 'approve').expect(200);
    const published = dataOf<QuestionVersionView>(
      await step(s.reviewer, version.id, 'publish').expect(200),
    );
    expect(published.state).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();

    const events = await system.client.outboxEvent.findMany({
      where: { type: 'content.published', aggregateId: question.id },
    });
    expect(events).toHaveLength(1);
    const history = await system.client.contentReview.findMany({
      where: { versionId: version.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((entry) => entry.action)).toEqual(['submit', 'approve', 'publish']);
  });

  it('never lets someone approve their own work, even holding both roles', async () => {
    const s = await studio();
    // The creator also accepts a reviewer invitation, so they hold every content permission.
    const creatorEmail = s.creatorEmail;
    await ctx
      .http()
      .post(url('/organizations/invitations'))
      .set(bearer(s.token))
      .send({ email: creatorEmail, role: 'CONTENT_REVIEWER', organizationId: s.root.id })
      .expect(201);
    await ctx
      .http()
      .post(url('/invitations/accept'))
      .set(bearer(s.creator))
      .send({ token: invitationTokenFrom((await ctx.email.waitFor(creatorEmail)).text) })
      .expect(200);

    const version = latest(await newQuestion(s));
    await step(s.creator, version.id, 'submit').expect(200);
    const selfApproval = await step(s.creator, version.id, 'approve').expect(403);
    expect(errorCode(selfApproval)).toBe(ERROR_CODES.SELF_REVIEW);
  });

  it('sends rejected work back with a reason, and blocks edits while in review', async () => {
    const s = await studio();
    const question = await newQuestion(s);
    const version = latest(question);
    await step(s.creator, version.id, 'submit').expect(200);

    const busy = await ctx
      .http()
      .put(url(`/questions/${question.id}/draft`))
      .set(bearer(s.creator))
      .send({ definition: multipleChoice('Changed while in review') })
      .expect(409);
    expect(errorCode(busy)).toBe(ERROR_CODES.CONTENT_STATE_INVALID);

    await step(s.reviewer, version.id, 'reject').expect(400);
    const rejected = dataOf<QuestionVersionView>(
      await step(s.reviewer, version.id, 'reject', 'Add a picture for younger readers').expect(200),
    );
    expect(rejected).toMatchObject({
      state: 'DRAFT',
      reviewNote: 'Add a picture for younger readers',
    });

    const edited = dataOf<QuestionView>(
      await ctx
        .http()
        .put(url(`/questions/${question.id}/draft`))
        .set(bearer(s.creator))
        .send({ definition: multipleChoice('What is two plus two?') })
        .expect(200),
    );
    expect(edited.versions).toHaveLength(1);
    expect(latest(edited).definition.prompt.en).toBe('What is two plus two?');
  });

  it('keeps a published version frozen: changes become version 2, and publishing retires version 1', async () => {
    const s = await studio();
    const question = await newQuestion(s);
    const first = latest(question);
    await step(s.creator, first.id, 'submit').expect(200);
    await step(s.reviewer, first.id, 'approve').expect(200);
    await step(s.reviewer, first.id, 'publish').expect(200);

    const revised = dataOf<QuestionView>(
      await ctx
        .http()
        .put(url(`/questions/${question.id}/draft`))
        .set(bearer(s.creator))
        .send({ definition: multipleChoice('What is 3 + 1?') })
        .expect(200),
    );
    expect(revised.versions.map((v) => [v.number, v.state])).toEqual([
      [2, 'DRAFT'],
      [1, 'PUBLISHED'],
    ]);
    expect((revised.versions[1] as QuestionVersionView).definition.prompt.en).toBe(
      'What is 2 + 2?',
    );

    const second = latest(revised);
    await step(s.creator, second.id, 'submit').expect(200);
    await step(s.reviewer, second.id, 'approve').expect(200);
    await step(s.reviewer, second.id, 'publish').expect(200);
    const after = dataOf<QuestionView>(
      await ctx
        .http()
        .get(url(`/questions/${question.id}`))
        .set(bearer(s.reviewer))
        .expect(200),
    );
    expect(after.versions.map((v) => [v.number, v.state])).toEqual([
      [2, 'PUBLISHED'],
      [1, 'ARCHIVED'],
    ]);
  });

  it('is enforced by the database too: a frozen version cannot be edited by any query', async () => {
    const s = await studio();
    const version = latest(await newQuestion(s));
    await step(s.creator, version.id, 'submit').expect(200);

    const database = ctx.app.get(TenantDatabase);
    const scope = { tenantId: s.tenantId, userId: s.owner.userId };
    await expect(
      database.run(scope, (tx) =>
        tx.questionVersion.update({
          where: { id: version.id },
          data: { definition: multipleChoice('Sneaky edit') },
        }),
      ),
    ).rejects.toThrow();
    // The system role bypasses RLS, but not the trigger.
    await expect(
      system.client.questionVersion.update({
        where: { id: version.id },
        data: { definition: multipleChoice('Sneaky edit') },
      }),
    ).rejects.toThrow();
  });
});

describe('question authoring rules', () => {
  it('refuses an answer key that does not fit, and a change of type', async () => {
    const s = await studio();
    const broken = await ctx
      .http()
      .post(url(`/question-banks/${s.bankId}/questions`))
      .set(bearer(s.creator))
      .send({ definition: { ...multipleChoice(), answer: { correctOptionId: 'z' } } })
      .expect(400);
    expect(errorCode(broken)).toBe(ERROR_CODES.DEFINITION_INVALID);
    expect(broken.body.error.details.problems).toHaveLength(1);

    const question = await newQuestion(s);
    const retyped = await ctx
      .http()
      .put(url(`/questions/${question.id}/draft`))
      .set(bearer(s.creator))
      .send({ definition: { type: 'TRUE_FALSE', prompt: { en: 'x' }, answer: { correct: true } } })
      .expect(400);
    expect(errorCode(retyped)).toBe(ERROR_CODES.DEFINITION_INVALID);
  });

  it('lets only the author edit a draft', async () => {
    const s = await studio();
    const question = await newQuestion(s);
    const another = (await joinAs(ctx, s, 'CONTENT_CREATOR')).token;
    await ctx
      .http()
      .put(url(`/questions/${question.id}/draft`))
      .set(bearer(another))
      .send({ definition: multipleChoice('Not mine') })
      .expect(403);
  });

  it('shows reviewers a queue of versions waiting for them', async () => {
    const s = await studio();
    const waiting = await newQuestion(s);
    await newQuestion(s, multipleChoice('Still a draft'));
    await step(s.creator, latest(waiting).id, 'submit').expect(200);
    const queue = dataOf<QuestionView[]>(
      await ctx
        .http()
        .get(url('/question-versions/review-queue'))
        .set(bearer(s.reviewer))
        .expect(200),
    );
    expect(queue.map((question) => question.id)).toEqual([waiting.id]);
    await ctx.http().get(url('/question-versions/review-queue')).set(bearer(s.creator)).expect(403);
  });
});

describe('question isolation', () => {
  it("keeps one school's questions away from another, and from staff without content roles", async () => {
    const mine = await studio();
    const theirs = await studio();
    const question = await newQuestion(mine);
    await step(mine.creator, latest(question).id, 'submit').expect(200);

    await ctx
      .http()
      .get(url(`/questions/${question.id}`))
      .set(bearer(theirs.reviewer))
      .expect(404);
    await ctx
      .http()
      .get(url(`/question-banks/${mine.bankId}/questions`))
      .set(bearer(theirs.creator))
      .expect(404);
    await step(theirs.reviewer, latest(question).id, 'approve').expect(404);
    await ctx
      .http()
      .post(url(`/question-banks/${mine.bankId}/questions`))
      .set(bearer(theirs.creator))
      .send({ definition: multipleChoice() })
      .expect(404);

    const teacher = await joinAs(ctx, mine, 'TEACHER');
    await ctx.http().get(url('/question-banks')).set(bearer(teacher.token)).expect(403);
    await ctx
      .http()
      .get(url(`/questions/${question.id}`))
      .set(bearer(teacher.token))
      .expect(403);
  });
});
