import { z } from 'zod';
import { localizedTextSchema } from './content.js';

/** Spec 8.5: the eleven supported question types. */
export const QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'MULTIPLE_SELECT',
  'TRUE_FALSE',
  'MATCHING',
  'ORDERING',
  'DRAG_AND_DROP',
  'FILL_IN_BLANK',
  'SHORT_TEXT',
  'AUDIO_RESPONSE',
  'IMAGE_HOTSPOT',
  'INTERACTIVE_SCENARIO',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

const id = z.string().trim().min(1).max(64);
/** An uploaded image or audio file, stored under the tenant's object keys. */
const assetRef = z.string().trim().min(1).max(256);

const choice = z.object({ id, text: localizedTextSchema, imageAsset: assetRef.optional() });
const uniqueIds = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const choices = (min: number) =>
  z.array(choice).min(min).max(12).refine(uniqueIds, 'Option ids must be unique');

/** A rectangle in image coordinates from 0 to 1, so it scales with the picture. */
const region = z
  .object({
    id,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.x + r.width <= 1 && r.y + r.height <= 1, 'Region must fit inside the image');

const base = {
  prompt: localizedTextSchema,
  /** Read aloud for children who cannot read yet. */
  promptAudio: assetRef.optional(),
};

/**
 * A full question definition, including the answer key. Only the server reads the key:
 * learners receive the result of stripping it (see the questions module), never this.
 */
export const questionDefinitionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MULTIPLE_CHOICE'),
    ...base,
    options: choices(2),
    answer: z.object({ correctOptionId: id }),
  }),
  z.object({
    type: z.literal('MULTIPLE_SELECT'),
    ...base,
    options: choices(2),
    answer: z.object({ correctOptionIds: z.array(id).min(1) }),
  }),
  z.object({
    type: z.literal('TRUE_FALSE'),
    ...base,
    answer: z.object({ correct: z.boolean() }),
  }),
  z.object({
    type: z.literal('MATCHING'),
    ...base,
    left: choices(2),
    right: choices(2),
    answer: z.object({ pairs: z.array(z.object({ leftId: id, rightId: id })).min(2) }),
  }),
  z.object({
    type: z.literal('ORDERING'),
    ...base,
    items: choices(2),
    answer: z.object({ orderedIds: z.array(id).min(2) }),
  }),
  z.object({
    type: z.literal('DRAG_AND_DROP'),
    ...base,
    zones: choices(1),
    items: choices(1),
    answer: z.object({ placements: z.array(z.object({ itemId: id, zoneId: id })).min(1) }),
  }),
  z.object({
    type: z.literal('FILL_IN_BLANK'),
    ...base,
    /** Text with {{blankId}} markers where the learner types. */
    text: localizedTextSchema,
    answer: z.object({
      blanks: z
        .array(
          z.object({
            id,
            accepted: z.array(z.string().trim().min(1).max(200)).min(1),
            caseSensitive: z.boolean().default(false),
          }),
        )
        .min(1),
    }),
  }),
  z.object({
    type: z.literal('SHORT_TEXT'),
    ...base,
    /** Answers that are marked right at once. Anything else goes to a teacher. */
    answer: z.object({ accepted: z.array(z.string().trim().min(1).max(500)).default([]) }),
  }),
  z.object({
    type: z.literal('AUDIO_RESPONSE'),
    ...base,
    maxSeconds: z.number().int().min(5).max(300).default(60),
    answer: z.object({ rubric: localizedTextSchema.optional() }),
  }),
  z.object({
    type: z.literal('IMAGE_HOTSPOT'),
    ...base,
    image: assetRef,
    regions: z.array(region).min(1).max(20).refine(uniqueIds, 'Region ids must be unique'),
    answer: z.object({ correctRegionIds: z.array(id).min(1) }),
  }),
  z.object({
    type: z.literal('INTERACTIVE_SCENARIO'),
    ...base,
    startNodeId: id,
    nodes: z
      .array(
        z.object({
          id,
          text: localizedTextSchema,
          choices: z
            .array(z.object({ id, text: localizedTextSchema, next: id.optional() }))
            .min(1)
            .max(6),
        }),
      )
      .min(1)
      .max(30),
    /** How good each choice is, from 0 to 1. The score is the average along the path taken. */
    answer: z.object({ choiceScores: z.record(id, z.number().min(0).max(1)) }),
  }),
]);
export type QuestionDefinition = z.infer<typeof questionDefinitionSchema>;

/** What a learner sends back, by question type. */
export const questionResponseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('MULTIPLE_CHOICE'), optionId: id }),
  z.object({ type: z.literal('MULTIPLE_SELECT'), optionIds: z.array(id).max(12) }),
  z.object({ type: z.literal('TRUE_FALSE'), value: z.boolean() }),
  z.object({
    type: z.literal('MATCHING'),
    pairs: z.array(z.object({ leftId: id, rightId: id })).max(12),
  }),
  z.object({ type: z.literal('ORDERING'), orderedIds: z.array(id).max(12) }),
  z.object({
    type: z.literal('DRAG_AND_DROP'),
    placements: z.array(z.object({ itemId: id, zoneId: id })).max(12),
  }),
  z.object({
    type: z.literal('FILL_IN_BLANK'),
    blanks: z.array(z.object({ id, value: z.string().max(200) })).max(20),
  }),
  z.object({ type: z.literal('SHORT_TEXT'), text: z.string().max(2000) }),
  z.object({ type: z.literal('AUDIO_RESPONSE'), audioAsset: assetRef }),
  z.object({
    type: z.literal('IMAGE_HOTSPOT'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  z.object({ type: z.literal('INTERACTIVE_SCENARIO'), choiceIds: z.array(id).max(30) }),
]);
export type QuestionResponse = z.infer<typeof questionResponseSchema>;

export const evaluationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('SCORED'),
    /** From 0 to 1. Partial credit where the type allows it. */
    score: z.number().min(0).max(1),
    correct: z.boolean(),
  }),
  /** A person has to mark it: audio, or open text that matched no accepted answer. */
  z.object({ status: z.literal('NEEDS_REVIEW') }),
]);
export type Evaluation = z.infer<typeof evaluationSchema>;
