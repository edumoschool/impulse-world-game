import { z } from 'zod';
import { contentStateSchema, localizedTextSchema } from './content.js';
import { learnerLessonSummarySchema } from './lessons.js';

const unitId = z.string().trim().min(1).max(64);

/**
 * A unit groups lessons in the order a learner takes them (spec 9.1). Lessons are named by id,
 * not by version: the path delivers whatever version of each lesson is live (ADR-014).
 */
export const learningPathUnitSchema = z.object({
  id: unitId,
  title: localizedTextSchema,
  summary: localizedTextSchema.optional(),
  lessonIds: z.array(z.uuid()).min(1).max(40),
});
export type LearningPathUnit = z.infer<typeof learningPathUnitSchema>;

export const learningPathContentSchema = z
  .object({
    title: localizedTextSchema,
    summary: localizedTextSchema.optional(),
    units: z.array(learningPathUnitSchema).min(1).max(40),
  })
  .superRefine((content, ctx) => {
    const unitIds = content.units.map((unit) => unit.id);
    if (new Set(unitIds).size !== unitIds.length) {
      ctx.addIssue({ code: 'custom', path: ['units'], message: 'Unit ids must be unique' });
    }
    const lessonIds = content.units.flatMap((unit) => unit.lessonIds);
    if (new Set(lessonIds).size !== lessonIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['units'],
        message: 'A lesson can appear only once in a path',
      });
    }
  });
export type LearningPathContent = z.infer<typeof learningPathContentSchema>;

/** Every lesson id a path names, in path order. */
export function learningPathLessonIds(content: LearningPathContent): string[] {
  return content.units.flatMap((unit) => unit.lessonIds);
}

export const createLearningPathRequestSchema = z.object({
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().optional(),
  content: learningPathContentSchema,
});
export type CreateLearningPathRequest = z.infer<typeof createLearningPathRequestSchema>;

export const saveLearningPathDraftRequestSchema = z.object({ content: learningPathContentSchema });
export type SaveLearningPathDraftRequest = z.infer<typeof saveLearningPathDraftRequestSchema>;

export const learningPathVersionViewSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  state: contentStateSchema,
  content: learningPathContentSchema,
  authorId: z.uuid(),
  reviewedBy: z.uuid().nullable(),
  reviewNote: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
});
export type LearningPathVersionView = z.infer<typeof learningPathVersionViewSchema>;

export const learningPathViewSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().nullable(),
  scope: z.enum(['GLOBAL', 'TENANT']),
  /** Newest first. */
  versions: z.array(learningPathVersionViewSchema),
});
export type LearningPathView = z.infer<typeof learningPathViewSchema>;

export const listLearningPathsQuerySchema = z.object({
  subjectId: z.uuid().optional(),
  gradeLevelId: z.uuid().optional(),
});
export type ListLearningPathsQuery = z.infer<typeof listLearningPathsQuerySchema>;

// ---------------------------------------------------------------------------
// What learners receive: the live path version, with each lesson's live version.
// ---------------------------------------------------------------------------

export const learnerPathSummarySchema = z.object({
  learningPathId: z.uuid(),
  versionId: z.uuid(),
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().nullable(),
  title: localizedTextSchema,
  summary: localizedTextSchema.nullable(),
  unitCount: z.number().int().nonnegative(),
  lessonCount: z.number().int().nonnegative(),
});
export type LearnerPathSummary = z.infer<typeof learnerPathSummarySchema>;

export const learnerPathUnitSchema = z.object({
  id: unitId,
  title: localizedTextSchema,
  summary: localizedTextSchema.nullable(),
  /** Lessons with a live version, in path order. A lesson taken offline is left out. */
  lessons: z.array(learnerLessonSummarySchema),
});
export type LearnerPathUnit = z.infer<typeof learnerPathUnitSchema>;

export const learnerPathSchema = learnerPathSummarySchema
  .omit({ unitCount: true, lessonCount: true })
  .extend({ units: z.array(learnerPathUnitSchema) });
export type LearnerPath = z.infer<typeof learnerPathSchema>;
