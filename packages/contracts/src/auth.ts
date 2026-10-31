import { z } from 'zod';
import { localeSchema, uuidSchema } from './common.js';
import { PERMISSIONS } from './permissions.js';

export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(12).max(128);
export const displayNameSchema = z.string().trim().min(1).max(80);

/** `cookie` for browsers, `bearer` for mobile clients (ADR-005). */
export const tokenTransportSchema = z.enum(['cookie', 'bearer']);
export type TokenTransport = z.infer<typeof tokenTransportSchema>;

const deviceLabelSchema = z.string().trim().min(1).max(100).optional();

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: localeSchema.default('en'),
  transport: tokenTransportSchema.default('bearer'),
  deviceLabel: deviceLabelSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  mfaCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  transport: tokenTransportSchema.default('bearer'),
  deviceLabel: deviceLabelSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const childLoginRequestSchema = z.object({
  loginCode: z.string().trim().min(3).max(64),
  username: z.string().trim().min(3).max(32),
  passcode: z.string().min(6).max(64),
  transport: tokenTransportSchema.default('bearer'),
  deviceLabel: deviceLabelSchema,
});
export type ChildLoginRequest = z.infer<typeof childLoginRequestSchema>;

/** The refresh token comes from this field on mobile and from a cookie on web. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256).optional(),
  transport: tokenTransportSchema.default('bearer'),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** The only client-supplied tenant id in the API. It is checked against active membership. */
export const switchTenantRequestSchema = z.object({ tenantId: uuidSchema });
export type SwitchTenantRequest = z.infer<typeof switchTenantRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const mfaConfirmRequestSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
export type MfaConfirmRequest = z.infer<typeof mfaConfirmRequestSchema>;

export const userKindSchema = z.enum(['ADULT', 'CHILD']);
export type UserKind = z.infer<typeof userKindSchema>;

export const tenantMembershipSchema = z.object({
  tenantId: uuidSchema,
  tenantName: z.string(),
  tenantKind: z.string(),
  loginCode: z.string(),
});
export type TenantMembership = z.infer<typeof tenantMembershipSchema>;

export const sessionViewSchema = z.object({
  user: z.object({
    id: uuidSchema,
    kind: userKindSchema,
    displayName: z.string(),
    locale: localeSchema,
  }),
  activeTenantId: uuidSchema.nullable(),
  tenants: z.array(tenantMembershipSchema),
  permissions: z.array(z.enum(PERMISSIONS)),
  /** Set for cookie sessions, so a reloaded page can recover its CSRF token. */
  csrfToken: z.string().optional(),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

export const authResultSchema = sessionViewSchema.extend({
  accessTokenExpiresIn: z.number().int().positive(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});
export type AuthResult = z.infer<typeof authResultSchema>;

export const sessionSummarySchema = z.object({
  id: uuidSchema,
  deviceLabel: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const mfaEnrollmentSchema = z.object({ secret: z.string(), otpauthUri: z.string() });
export type MfaEnrollment = z.infer<typeof mfaEnrollmentSchema>;
