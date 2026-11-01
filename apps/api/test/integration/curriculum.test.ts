import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  type GradeLevelView,
  type SkillView,
  type SubjectView,
} from '@impulse/contracts';
import { SystemDatabase } from '../../src/infrastructure/database/system-database.js';
import { TenantDatabase } from '../../src/infrastructure/database/tenant-database.js';
import { bearer, createSchool, joinAs, type School } from '../support/schools.js';
import { createTestApp, dataOf, type TestApp, unique, url } from '../support/test-app.js';

let ctx: TestApp;
let system: SystemDatabase;

beforeAll(async () => {
  ctx = await createTestApp();
  system = ctx.app.get(SystemDatabase);
});
afterAll(() => ctx.close());

const errorCode = (response: { body: { error?: { code?: string } } }) => response.body.error?.code;
const code = (prefix: string) =>
  `${prefix}_${unique('x')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()}`;

/** A school with a content creator in it. */
async function schoolWithCreator(): Promise<School & { creator: string }> {
  const school = await createSchool(ctx);
  const { token } = await joinAs(ctx, school, 'CONTENT_CREATOR');
  return { ...school, creator: token };
}

async function createSubject(token: string, subjectCode = code('SUBJ')) {
  return dataOf<SubjectView>(
    await ctx
      .http()
      .post(url('/curriculum/subjects'))
      .set(bearer(token))
      .send({ code: subjectCode, title: { en: 'Chess', uz: 'Shaxmat' } })
      .expect(201),
  );
}

async function createSkill(token: string, subjectId: string) {
  return dataOf<SkillView>(
    await ctx
      .http()
      .post(url('/curriculum/skills'))
      .set(bearer(token))
      .send({ code: code('SKILL'), subjectId, title: { en: 'A skill' } })
      .expect(201),
  );
}

describe('global taxonomy', () => {
  it('gives every member the seeded grade levels and core subjects, read-only', async () => {
    const school = await createSchool(ctx);
    const levels = dataOf<GradeLevelView[]>(
      await ctx.http().get(url('/curriculum/grade-levels')).set(bearer(school.token)).expect(200),
    );
    expect(levels.map((level) => level.code)).toEqual([
      'PRESCHOOL',
      'GRADE_1',
      'GRADE_2',
      'GRADE_3',
      'GRADE_4',
      'GRADE_5',
      'GRADE_6',
    ]);
    const subjects = dataOf<SubjectView[]>(
      await ctx.http().get(url('/curriculum/subjects')).set(bearer(school.token)).expect(200),
    );
    const global = subjects.filter((subject) => subject.scope === 'GLOBAL');
    expect(global.map((subject) => subject.code)).toEqual([
      'LANGUAGE',
      'MATH',
      'SCIENCE',
      'DISCOVERY',
      'CREATIVE',
      'TECH',
    ]);
    expect(
      global.every((subject) => subject.title.en && subject.title.uz && subject.title.ru),
    ).toBe(true);
  });

  it('cannot be changed through the request role, even by direct queries', async () => {
    const school = await createSchool(ctx);
    const database = ctx.app.get(TenantDatabase);
    const math = await system.client.subject.findFirstOrThrow({
      where: { tenantId: null, code: 'MATH' },
    });
    const scope = { tenantId: school.tenantId, userId: school.owner.userId };

    const updated = await database.run(scope, (tx) =>
      tx.subject.updateMany({ where: { id: math.id }, data: { sortOrder: 999 } }),
    );
    expect(updated.count).toBe(0);
    await expect(
      database.run(scope, (tx) =>
        tx.subject.create({ data: { tenantId: null, code: code('ROGUE'), title: { en: 'x' } } }),
      ),
    ).rejects.toThrow();
    await expect(database.run(scope, (tx) => tx.gradeLevel.deleteMany({}))).rejects.toThrow();
  });
});

describe('school subjects and skills', () => {
  it('lets a content creator add a subject that only their school sees', async () => {
    const school = await schoolWithCreator();
    const other = await createSchool(ctx);
    const subject = await createSubject(school.creator);
    expect(subject.scope).toBe('TENANT');

    const list = async (token: string) =>
      dataOf<SubjectView[]>(
        await ctx.http().get(url('/curriculum/subjects')).set(bearer(token)).expect(200),
      ).map((entry) => entry.id);
    expect(await list(school.token)).toContain(subject.id);
    expect(await list(other.token)).not.toContain(subject.id);
  });

  it('refuses members without content.edit', async () => {
    const school = await createSchool(ctx);
    const teacher = await joinAs(ctx, school, 'TEACHER');
    for (const token of [school.token, teacher.token]) {
      await ctx
        .http()
        .post(url('/curriculum/subjects'))
        .set(bearer(token))
        .send({ code: code('NOPE'), title: { en: 'No' } })
        .expect(403);
    }
  });

  it('refuses a duplicate code in the same school, and invalid text', async () => {
    const school = await schoolWithCreator();
    const subjectCode = code('DUP');
    await createSubject(school.creator, subjectCode);
    const response = await ctx
      .http()
      .post(url('/curriculum/subjects'))
      .set(bearer(school.creator))
      .send({ code: subjectCode, title: { en: 'Again' } })
      .expect(409);
    expect(errorCode(response)).toBe(ERROR_CODES.CODE_TAKEN);
    await ctx
      .http()
      .post(url('/curriculum/subjects'))
      .set(bearer(school.creator))
      .send({ code: code('EMPTY'), title: {} })
      .expect(400);
  });

  it('builds skills on a global subject', async () => {
    const school = await schoolWithCreator();
    const subjects = dataOf<SubjectView[]>(
      await ctx.http().get(url('/curriculum/subjects')).set(bearer(school.creator)).expect(200),
    );
    const math = subjects.find((subject) => subject.code === 'MATH') as SubjectView;
    const skill = await createSkill(school.creator, math.id);
    const skills = dataOf<SkillView[]>(
      await ctx
        .http()
        .get(url(`/curriculum/skills?subjectId=${math.id}`))
        .set(bearer(school.token))
        .expect(200),
    );
    expect(skills.map((entry) => entry.id)).toContain(skill.id);
  });

  it("cannot point at another school's subject or skill, even knowing its id", async () => {
    const mine = await schoolWithCreator();
    const theirs = await schoolWithCreator();
    const theirSubject = await createSubject(theirs.creator);
    const theirSkill = await createSkill(theirs.creator, theirSubject.id);

    await ctx
      .http()
      .post(url('/curriculum/skills'))
      .set(bearer(mine.creator))
      .send({ code: code('STEAL'), subjectId: theirSubject.id, title: { en: 'x' } })
      .expect(404);

    const mySubject = await createSubject(mine.creator);
    const mySkill = await createSkill(mine.creator, mySubject.id);
    await ctx
      .http()
      .post(url(`/curriculum/skills/${mySkill.id}/prerequisites`))
      .set(bearer(mine.creator))
      .send({ prerequisiteId: theirSkill.id })
      .expect(404);
    await ctx
      .http()
      .post(url(`/curriculum/skills/${theirSkill.id}/prerequisites`))
      .set(bearer(mine.creator))
      .send({ prerequisiteId: mySkill.id })
      .expect(404);
  });

  it('records prerequisites and refuses a loop', async () => {
    const school = await schoolWithCreator();
    const subject = await createSubject(school.creator);
    const [a, b, c] = [
      await createSkill(school.creator, subject.id),
      await createSkill(school.creator, subject.id),
      await createSkill(school.creator, subject.id),
    ] as [SkillView, SkillView, SkillView];
    const needs = (skill: SkillView, prerequisite: SkillView) =>
      ctx
        .http()
        .post(url(`/curriculum/skills/${skill.id}/prerequisites`))
        .set(bearer(school.creator))
        .send({ prerequisiteId: prerequisite.id });

    await needs(b, a).expect(204);
    await needs(c, b).expect(204);
    const loop = await needs(a, c).expect(409);
    expect(errorCode(loop)).toBe(ERROR_CODES.PREREQUISITE_CYCLE);
    await needs(a, a).expect(409);

    const skills = dataOf<SkillView[]>(
      await ctx
        .http()
        .get(url(`/curriculum/skills?subjectId=${subject.id}`))
        .set(bearer(school.creator))
        .expect(200),
    );
    expect(skills.find((skill) => skill.id === c.id)?.prerequisiteIds).toEqual([b.id]);

    await ctx
      .http()
      .delete(url(`/curriculum/skills/${b.id}/prerequisites/${a.id}`))
      .set(bearer(school.creator))
      .expect(204);
    await needs(a, c).expect(204);
  });
});
