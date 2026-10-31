import { z } from 'zod';
import { uuidSchema } from './common.js';
import { emailSchema } from './auth.js';
import { TENANT_ASSIGNABLE_ROLES } from './permissions.js';

export const INSTITUTION_KINDS = [
  'LEARNING_CENTER',
  'PRIVATE_SCHOOL',
  'PUBLIC_SCHOOL',
  'FRANCHISE',
] as const;
export const institutionKindSchema = z.enum(INSTITUTION_KINDS);

export const createInstitutionRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: institutionKindSchema,
});
export type CreateInstitutionRequest = z.infer<typeof createInstitutionRequestSchema>;

export const organizationKindSchema = z.enum(['ROOT', 'BRANCH', 'DEPARTMENT']);
export type OrganizationKind = z.infer<typeof organizationKindSchema>;

export const createOrganizationUnitRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['BRANCH', 'DEPARTMENT']),
  parentId: uuidSchema,
});
export type CreateOrganizationUnitRequest = z.infer<typeof createOrganizationUnitRequestSchema>;

export const organizationViewSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: organizationKindSchema,
  parentId: uuidSchema.nullable(),
});
export type OrganizationView = z.infer<typeof organizationViewSchema>;

export const assignableRoleSchema = z.enum(TENANT_ASSIGNABLE_ROLES);

export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema,
  organizationId: uuidSchema,
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationViewSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  role: assignableRoleSchema,
  expiresAt: z.iso.datetime(),
});
export type InvitationView = z.infer<typeof invitationViewSchema>;

export const acceptInvitationRequestSchema = z.object({ token: z.string().min(32).max(256) });
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const memberViewSchema = z.object({
  userId: uuidSchema,
  displayName: z.string(),
  organizationId: uuidSchema,
  roles: z.array(z.string()),
  joinedAt: z.iso.datetime(),
});
export type MemberView = z.infer<typeof memberViewSchema>;
