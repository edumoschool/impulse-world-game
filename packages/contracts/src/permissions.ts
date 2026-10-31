/** Single source of truth for permissions. `pnpm db:seed` synchronises this to the database. */
export const PERMISSIONS = [
  'student.learn',
  'student.play',
  'student.view_own_progress',
  'parent.view_child_progress',
  'parent.manage_child_settings',
  'parent.manage_consent',
  'parent.manage_guardians',
  'children.provision',
  'children.view_all',
  'teacher.manage_class',
  'teacher.assign_learning_path',
  'teacher.review_submissions',
  'content.create',
  'content.edit',
  'content.submit_for_review',
  'content.review',
  'content.publish',
  'organization.view',
  'organization.manage_structure',
  'organization.manage_members',
  'organization.manage_billing',
  'organization.view_audit_logs',
  'platform.manage_tenants',
  'platform.manage_users',
  'platform.manage_content',
  'platform.view_audit_logs',
  'support.view_accounts',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  'CHILD',
  'PARENT',
  'TEACHER',
  'SCHOOL_ADMIN',
  'CONTENT_CREATOR',
  'CONTENT_REVIEWER',
  'ORGANIZATION_OWNER',
  'PLATFORM_ADMIN',
  'SUPPORT_AGENT',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles a tenant may grant to its own members. Platform roles are never assignable by a tenant. */
export const TENANT_ASSIGNABLE_ROLES = [
  'PARENT',
  'TEACHER',
  'SCHOOL_ADMIN',
  'CONTENT_CREATOR',
  'CONTENT_REVIEWER',
] as const satisfies readonly RoleKey[];

export type TenantAssignableRole = (typeof TENANT_ASSIGNABLE_ROLES)[number];

export const PLATFORM_ROLES: readonly RoleKey[] = ['PLATFORM_ADMIN', 'SUPPORT_AGENT'];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  CHILD: ['student.learn', 'student.play', 'student.view_own_progress'],
  PARENT: [
    'parent.view_child_progress',
    'parent.manage_child_settings',
    'parent.manage_consent',
    'parent.manage_guardians',
    'children.provision',
  ],
  TEACHER: [
    'teacher.manage_class',
    'teacher.assign_learning_path',
    'teacher.review_submissions',
    'organization.view',
  ],
  SCHOOL_ADMIN: [
    'children.provision',
    'children.view_all',
    'parent.manage_consent',
    'parent.manage_guardians',
    'organization.view',
    'organization.manage_structure',
    'organization.manage_members',
    'organization.view_audit_logs',
  ],
  CONTENT_CREATOR: ['content.create', 'content.edit', 'content.submit_for_review'],
  CONTENT_REVIEWER: ['content.review', 'content.publish'],
  ORGANIZATION_OWNER: [
    'children.view_all',
    'organization.view',
    'organization.manage_structure',
    'organization.manage_members',
    'organization.manage_billing',
    'organization.view_audit_logs',
  ],
  PLATFORM_ADMIN: [
    'platform.manage_tenants',
    'platform.manage_users',
    'platform.manage_content',
    'platform.view_audit_logs',
  ],
  SUPPORT_AGENT: ['support.view_accounts'],
};

/** Permissions that only work on a session that passed MFA (spec 24.3). */
export function requiresMfa(permission: Permission): boolean {
  return permission.startsWith('platform.') || permission.startsWith('support.');
}
