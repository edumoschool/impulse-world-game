import { z } from 'zod';
import { contentStateSchema, localizedTextSchema } from './content.js';
import { type LearnerQuestion, learnerQuestionSchema } from './questions.js';

const blockId = z.string().trim().min(1).max(64);
const assetRef = z.string().trim().min(1).max(256);

/**
 * The parts of a lesson, in order. Media needs a text alternative (spec 28): alt text for
 * images and a transcript for audio and video, so every child can follow the lesson.
 */
export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.object({ id: blockId, type: z.literal('TEXT'), body: localizedTextSchema }),
  z.object({
    id: blockId,
    type: z.literal('IMAGE'),
    asset: assetRef,
    alt: localizedTextSchema,
    caption: localizedTextSchema.optional(),
  }),
  z.object({
    id: blockId,
    type: z.literal('AUDIO'),
    asset: assetRef,
    transcript: localizedTextSchema,
  }),
  z.object({
    id: blockId,
    type: z.literal('VIDEO'),
    asset: assetRef,
    captionsAsset: assetRef.optional(),
    transcript: localizedTextSchema,
  }),
  /** Names an exact question version, which must be published before the lesson can be. */
  z.object({ id: blockId, type: z.literal('QUESTION'), questionVersionId: z.uuid() }),
]);
export type LessonBlock = z.infer<typeof lessonBlockSchema>;

export const lessonContentSchema = z.object({
  title: localizedTextSchema,
  summary: localizedTextSchema.optional(),
  estimatedMinutes: z.number().int().min(1).max(120),
  blocks: z
    .array(lessonBlockSchema)
    .min(1)
    .max(60)
    .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, {
      message: 'Block ids must be unique',
    }),
});
export type LessonContent = z.infer<typeof lessonContentSchema>;

export const createLessonRequestSchema = z.object({
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().optional(),
  content: lessonContentSchema,
});
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;

export const saveLessonDraftRequestSchema = z.object({ content: lessonContentSchema });
export type SaveLessonDraftRequest = z.infer<typeof saveLessonDraftRequestSchema>;

export const lessonVersionViewSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  state: contentStateSchema,
  content: lessonContentSchema,
  authorId: z.uuid(),
  reviewedBy: z.uuid().nullable(),
  reviewNote: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
});
export type LessonVersionView = z.infer<typeof lessonVersionViewSchema>;

export const lessonViewSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().nullable(),
  scope: z.enum(['GLOBAL', 'TENANT']),
  /** Newest first. */
  versions: z.array(lessonVersionViewSchema),
});
export type LessonView = z.infer<typeof lessonViewSchema>;

export const listLessonsQuerySchema = z.object({ subjectId: z.uuid().optional() });
export type ListLessonsQuery = z.infer<typeof listLessonsQuerySchema>;

// ---------------------------------------------------------------------------
// What learners receive: only published versions, and questions without answer keys.
// ---------------------------------------------------------------------------

export const learnerLessonBlockSchema = z.union([
  lessonBlockSchema.options[0],
  lessonBlockSchema.options[1],
  lessonBlockSchema.options[2],
  lessonBlockSchema.options[3],
  z.object({
    id: blockId,
    type: z.literal('QUESTION'),
    questionVersionId: z.uuid(),
    question: learnerQuestionSchema,
  }),
]);

export const learnerLessonSchema = z.object({
  lessonId: z.uuid(),
  versionId: z.uuid(),
  subjectId: z.uuid(),
  title: localizedTextSchema,
  summary: localizedTextSchema.nullable(),
  estimatedMinutes: z.number().int(),
  blocks: z.array(learnerLessonBlockSchema),
});
/** Typed by hand, because the learner question schema is built at runtime from the definitions. */
export type LearnerLessonBlock =
  | Exclude<LessonBlock, { type: 'QUESTION' }>
  | (Extract<LessonBlock, { type: 'QUESTION' }> & { question: LearnerQuestion });
export type LearnerLesson = Omit<z.infer<typeof learnerLessonSchema>, 'blocks'> & {
  blocks: LearnerLessonBlock[];
};

export const learnerLessonSummarySchema = learnerLessonSchema.omit({ blocks: true });
export type LearnerLessonSummary = Omit<LearnerLesson, 'blocks'>;
