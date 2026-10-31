import { z } from 'zod';
import { localeSchema, uuidSchema } from './common.js';
import { emailSchema } from './auth.js';

export const CONSENT_SCOPES = [
  'ACCOUNT_ACCESS',
  'LEARNING_ANALYTICS',
  'AI_ASSISTANCE',
  'CLASSROOM_LEADERBOARDS',
] as const;
export const consentScopeSchema = z.enum(CONSENT_SCOPES);
export type ConsentScope = z.infer<typeof consentScopeSchema>;

export const consentBasisSchema = z.enum(['PARENTAL', 'SCHOOL_AUTHORIZED']);
export type ConsentBasis = z.infer<typeof consentBasisSchema>;

const currentYear = new Date().getUTCFullYear();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,32}$/, 'Use 3 to 32 letters, digits, dots, dashes or underscores');

/** Birth year, not a full date, to keep personal data to the minimum the product needs. */
export const birthYearSchema = z
  .number()
  .int()
  .min(currentYear - 18)
  .max(currentYear - 3);

export const consentGrantSchema = z.object({
  policyVersion: z.string().trim().min(1).max(32),
  scopes: z.array(consentScopeSchema).min(1),
});
export type ConsentGrant = z.infer<typeof consentGrantSchema>;

export const createChildRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  username: usernameSchema,
  passcode: z.string().min(6).max(64),
  birthYear: birthYearSchema,
  locale: localeSchema.default('en'),
  consent: consentGrantSchema.refine((c) => c.scopes.includes('ACCOUNT_ACCESS'), {
    message: 'ACCOUNT_ACCESS consent is required to create an account',
  }),
});
export type CreateChildRequest = z.infer<typeof createChildRequestSchema>;

export const childSettingsSchema = z.object({
  dailyMinutesLimit: z.number().int().min(10).max(240).nullable(),
  aiTutorEnabled: z.boolean(),
  leaderboardsEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
});
export type ChildSettings = z.infer<typeof childSettingsSchema>;

export const updateChildSettingsRequestSchema = childSettingsSchema.partial();
export type UpdateChildSettingsRequest = z.infer<typeof updateChildSettingsRequestSchema>;

export const childViewSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  username: z.string(),
  birthYear: z.number().int(),
  locale: localeSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  settings: childSettingsSchema,
  createdAt: z.iso.datetime(),
});
export type ChildView = z.infer<typeof childViewSchema>;

export const consentViewSchema = z.object({
  id: uuidSchema,
  policyVersion: z.string(),
  scopes: z.array(consentScopeSchema),
  basis: consentBasisSchema,
  grantedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ConsentView = z.infer<typeof consentViewSchema>;

export const guardianViewSchema = z.object({
  userId: uuidSchema,
  displayName: z.string(),
  relationship: z.string(),
  linkedAt: z.iso.datetime(),
});
export type GuardianView = z.infer<typeof guardianViewSchema>;

export const inviteGuardianRequestSchema = z.object({
  email: emailSchema,
  relationship: z.string().trim().min(1).max(32).default('guardian'),
});
export type InviteGuardianRequest = z.infer<typeof inviteGuardianRequestSchema>;

export const childGuardianParamsSchema = z.object({ id: uuidSchema, userId: uuidSchema });
export type ChildGuardianParams = z.infer<typeof childGuardianParamsSchema>;

export const childConsentParamsSchema = z.object({ id: uuidSchema, consentId: uuidSchema });
export type ChildConsentParams = z.infer<typeof childConsentParamsSchema>;
