import { describe, expect, it } from 'vitest';
import { learningPathContentSchema, learningPathLessonIds } from './learning-paths.js';

const lessonA = '0194f7a0-7c3e-7b1a-8a2e-aaaaaaaaaaaa';
const lessonB = '0194f7a0-7c3e-7b1a-8a2e-bbbbbbbbbbbb';

const content = (units: unknown) => ({ title: { en: 'Numbers to ten' }, units });

describe('learning path content', () => {
  it('accepts ordered units of lessons and lists the lessons in path order', () => {
    const parsed = learningPathContentSchema.parse(
      content([
        { id: 'counting', title: { en: 'Counting' }, lessonIds: [lessonB] },
        { id: 'adding', title: { en: 'Adding' }, lessonIds: [lessonA] },
      ]),
    );
    expect(learningPathLessonIds(parsed)).toEqual([lessonB, lessonA]);
  });

  it('refuses repeated unit ids', () => {
    const result = learningPathContentSchema.safeParse(
      content([
        { id: 'same', title: { en: 'One' }, lessonIds: [lessonA] },
        { id: 'same', title: { en: 'Two' }, lessonIds: [lessonB] },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it('refuses a lesson that appears twice, even across units', () => {
    const result = learningPathContentSchema.safeParse(
      content([
        { id: 'one', title: { en: 'One' }, lessonIds: [lessonA] },
        { id: 'two', title: { en: 'Two' }, lessonIds: [lessonA] },
      ]),
    );
    expect(result.success).toBe(false);
  });

  it('refuses empty paths and empty units', () => {
    expect(learningPathContentSchema.safeParse(content([])).success).toBe(false);
    expect(
      learningPathContentSchema.safeParse(
        content([{ id: 'empty', title: { en: 'Empty' }, lessonIds: [] }]),
      ).success,
    ).toBe(false);
  });
});
