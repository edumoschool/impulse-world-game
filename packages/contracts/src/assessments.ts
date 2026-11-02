import { z } from 'zod';
import { contentStateSchema, localizedTextSchema } from './content.js';
import {
  type LearnerQuestion,
  learnerQuestionSchema,
  questionResponseSchema,
} from './questions.js';

const itemId = z.string().trim().min(1).max(64);

/** One scored item. It names an exact question version, which must be published first. */
export const assessmentItemSchema = z.object({
  id: itemId,
  questionVersionId: z.uuid(),
  points: z.number().int().min(1).max(10).default(1),
});
export type AssessmentItem = z.infer<typeof assessmentItemSchema>;

export const assessmentContentSchema = z.object({
  title: localizedTextSchema,
  instructions: localizedTextSchema.optional(),
  items: z
    .array(assessmentItemSchema)
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
      message: 'Item ids must be unique',
    }),
  /** The share of points needed to pass, from 0 to 1. */
  passingScore: z.number().min(0).max(1),
  /** How many submitted attempts a learner may make. Absent means no limit. */
  maxAttempts: z.number().int().min(1).max(20).optional(),
});
export type AssessmentContent = z.infer<typeof assessmentContentSchema>;
export type AssessmentContentInput = z.input<typeof assessmentContentSchema>;

export const createAssessmentRequestSchema = z.object({
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().optional(),
  content: assessmentContentSchema,
});
export type CreateAssessmentRequest = z.infer<typeof createAssessmentRequestSchema>;

export const saveAssessmentDraftRequestSchema = z.object({ content: assessmentContentSchema });
export type SaveAssessmentDraftRequest = z.infer<typeof saveAssessmentDraftRequestSchema>;

export const assessmentVersionViewSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  state: contentStateSchema,
  content: assessmentContentSchema,
  authorId: z.uuid(),
  reviewedBy: z.uuid().nullable(),
  reviewNote: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
});
export type AssessmentVersionView = z.infer<typeof assessmentVersionViewSchema>;

export const assessmentViewSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  gradeLevelId: z.uuid().nullable(),
  scope: z.enum(['GLOBAL', 'TENANT']),
  /** Newest first. */
  versions: z.array(assessmentVersionViewSchema),
});
export type AssessmentView = z.infer<typeof assessmentViewSchema>;

export const listAssessmentsQuerySchema = z.object({ subjectId: z.uuid().optional() });
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;

// ---------------------------------------------------------------------------
// Learners: attempts, responses and results. No answer key ever leaves the server.
// ---------------------------------------------------------------------------

export const ATTEMPT_STATES = ['IN_PROGRESS', 'SUBMITTED'] as const;
export const attemptStateSchema = z.enum(ATTEMPT_STATES);
export type AttemptState = z.infer<typeof attemptStateSchema>;

export const RESPONSE_OUTCOMES = [
  'CORRECT',
  'PARTIAL',
  'INCORRECT',
  'UNANSWERED',
  'NEEDS_REVIEW',
] as const;
export const responseOutcomeSchema = z.enum(RESPONSE_OUTCOMES);
export type ResponseOutcome = z.infer<typeof responseOutcomeSchema>;

export const learnerAssessmentSummarySchema = z.object({
  assessmentId: z.uuid(),
  versionId: z.uuid(),
  subjectId: z.uuid(),
  title: localizedTextSchema,
  itemCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive().nullable(),
  /** Submitted attempts by this learner, on any version. */
  attemptsUsed: z.number().int().nonnegative(),
});
export type LearnerAssessmentSummary = z.infer<typeof learnerAssessmentSummarySchema>;

export const attemptItemResultSchema = z.object({
  itemId,
  outcome: responseOutcomeSchema,
  /** From 0 to 1. Null while a person still has to mark it. */
  score: z.number().min(0).max(1).nullable(),
});
export type AttemptItemResult = z.infer<typeof attemptItemResultSchema>;

export const attemptResultSchema = z.object({
  /** Share of all points earned, from 0 to 1. Items waiting for a person count as zero. */
  score: z.number().min(0).max(1),
  earnedPoints: z.number().nonnegative(),
  maxPoints: z.number().int().positive(),
  /** Null while any item is waiting for a person to mark it. */
  passed: z.boolean().nullable(),
  pendingReview: z.number().int().nonnegative(),
  items: z.array(attemptItemResultSchema),
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const learnerAttemptItemSchema = z.object({
  id: itemId,
  points: z.number().int(),
  questionVersionId: z.uuid(),
  question: learnerQuestionSchema,
  response: questionResponseSchema.nullable(),
});

export const learnerAttemptSchema = z.object({
  attemptId: z.uuid(),
  assessmentId: z.uuid(),
  versionId: z.uuid(),
  title: localizedTextSchema,
  instructions: localizedTextSchema.nullable(),
  state: attemptStateSchema,
  startedAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  items: z.array(learnerAttemptItemSchema),
  /** Present once the attempt is submitted. */
  result: attemptResultSchema.nullable(),
});
/** Typed by hand, because the learner question schema is built at runtime from the definitions. */
export type LearnerAttempt = Omit<z.infer<typeof learnerAttemptSchema>, 'items'> & {
  items: (Omit<z.infer<typeof learnerAttemptItemSchema>, 'question'> & {
    question: LearnerQuestion;
  })[];
};

export const saveResponseRequestSchema = z.object({ response: questionResponseSchema });
export type SaveResponseRequest = z.infer<typeof saveResponseRequestSchema>;

export const savedResponseSchema = z.object({ itemId, savedAt: z.iso.datetime() });
export type SavedResponse = z.infer<typeof savedResponseSchema>;
