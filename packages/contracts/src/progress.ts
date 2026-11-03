import { z } from 'zod';

/** Spec 9.4. Only scored evidence moves a learner through these; completion never does. */
export const MASTERY_LEVELS = [
  'NOT_STARTED',
  'INTRODUCED',
  'PRACTICING',
  'DEVELOPING',
  'PROFICIENT',
  'MASTERED',
] as const;
export const masteryLevelSchema = z.enum(MASTERY_LEVELS);
export type MasteryLevel = z.infer<typeof masteryLevelSchema>;

export const lessonCompletionSchema = z.object({
  lessonId: z.uuid(),
  lessonVersionId: z.uuid(),
  completedAt: z.iso.datetime(),
});
export type LessonCompletionView = z.infer<typeof lessonCompletionSchema>;

export const skillProgressSchema = z.object({
  skillId: z.uuid(),
  level: masteryLevelSchema,
  observationCount: z.number().int().nonnegative(),
  /** Mean score, from 0 to 1, over the recent observations the mastery model looks at. */
  recentAccuracy: z.number().min(0).max(1),
  lastObservedAt: z.iso.datetime(),
});
export type SkillProgress = z.infer<typeof skillProgressSchema>;

/** One learner's progress. Skills with no evidence yet are absent, which means NOT_STARTED. */
export const learnerProgressSchema = z.object({
  completedLessons: z.array(lessonCompletionSchema),
  skills: z.array(skillProgressSchema),
});
export type LearnerProgress = z.infer<typeof learnerProgressSchema>;
