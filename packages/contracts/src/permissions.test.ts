import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  PLATFORM_ROLES,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  TENANT_ASSIGNABLE_ROLES,
  requiresMfa,
} from './permissions.js';

describe('permission catalogue', () => {
  it('gives every role only permissions from the catalogue', () => {
    for (const role of ROLE_KEYS) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('never lets a child manage accounts or see other children', () => {
    expect(ROLE_PERMISSIONS.CHILD.every((p) => p.startsWith('student.'))).toBe(true);
  });

  it('never lets a parent or teacher alter content publication', () => {
    expect(ROLE_PERMISSIONS.PARENT).not.toContain('content.publish');
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain('content.publish');
  });

  it('separates creating content from publishing it', () => {
    expect(ROLE_PERMISSIONS.CONTENT_CREATOR).not.toContain('content.publish');
    expect(ROLE_PERMISSIONS.CONTENT_CREATOR).not.toContain('content.review');
  });

  it('does not let tenants assign platform roles', () => {
    for (const role of PLATFORM_ROLES) {
      expect(TENANT_ASSIGNABLE_ROLES as readonly string[]).not.toContain(role);
    }
  });

  it('requires MFA for every platform and support permission', () => {
    expect(requiresMfa('platform.manage_users')).toBe(true);
    expect(requiresMfa('support.view_accounts')).toBe(true);
    expect(requiresMfa('organization.manage_members')).toBe(false);
  });
});
