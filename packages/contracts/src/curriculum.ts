import { z } from 'zod';
import { uuidSchema } from './common.js';
import { localizedTextSchema } from './content.js';

/** Stable identifiers such as MATH or FRACTIONS_COMPARE. */
export const contentCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Use 2 to 64 capital letters, digits or underscores');

/** Global rows belong to the platform and are read-only to every tenant (ADR-013). */
export const contentScopeSchema = z.enum(['GLOBAL', 'TENANT']);
export type ContentScope = z.infer<typeof contentScopeSchema>;

export const gradeLevelViewSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  title: localizedTextSchema,
  rank: z.number().int(),
  minAge: z.number().int(),
  maxAge: z.number().int(),
  scope: contentScopeSchema,
});
export type GradeLevelView = z.infer<typeof gradeLevelViewSchema>;

export const subjectViewSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  sortOrder: z.number().int(),
  scope: contentScopeSchema,
});
export type SubjectView = z.infer<typeof subjectViewSchema>;

export const createSubjectRequestSchema = z.object({
  code: contentCodeSchema,
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(100),
});
export type CreateSubjectRequest = z.infer<typeof createSubjectRequestSchema>;

export const skillViewSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  subjectId: uuidSchema,
  gradeLevelId: uuidSchema.nullable(),
  title: localizedTextSchema,
  description: localizedTextSchema.nullable(),
  prerequisiteIds: z.array(uuidSchema),
  scope: contentScopeSchema,
});
export type SkillView = z.infer<typeof skillViewSchema>;

export const createSkillRequestSchema = z.object({
  code: contentCodeSchema,
  subjectId: uuidSchema,
  gradeLevelId: uuidSchema.optional(),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
});
export type CreateSkillRequest = z.infer<typeof createSkillRequestSchema>;

export const listSkillsQuerySchema = z.object({ subjectId: uuidSchema.optional() });
export type ListSkillsQuery = z.infer<typeof listSkillsQuerySchema>;

export const addPrerequisiteRequestSchema = z.object({ prerequisiteId: uuidSchema });
export type AddPrerequisiteRequest = z.infer<typeof addPrerequisiteRequestSchema>;
