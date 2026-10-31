import { describe, expect, it } from 'vitest';
import { type Permission, ROLE_PERMISSIONS } from '@impulse/contracts';
import {
  canRemoveGuardian,
  childAccessPolicy,
  hasAccountAccessConsent,
} from './child-access-policy.js';

const child = { userId: 'child-user' };
const permissions = (...roles: (keyof typeof ROLE_PERMISSIONS)[]): Set<Permission> =>
  new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]));

describe('childAccessPolicy', () => {
  it('lets a child view their own profile', () => {
    const subject = { userId: 'child-user', permissions: permissions('CHILD'), isGuardian: false };
    expect(childAccessPolicy.canView(subject, child)).toBe(true);
  });

  it("does not let a child view another child's profile", () => {
    const subject = { userId: 'other-child', permissions: permissions('CHILD'), isGuardian: false };
    expect(childAccessPolicy.canView(subject, child)).toBe(false);
  });

  it('lets a parent view only a linked child', () => {
    const linked = { userId: 'parent', permissions: permissions('PARENT'), isGuardian: true };
    const unlinked = { ...linked, isGuardian: false };
    expect(childAccessPolicy.canView(linked, child)).toBe(true);
    expect(childAccessPolicy.canView(unlinked, child)).toBe(false);
  });

  it('lets a school admin view any child, but not change home settings', () => {
    const subject = {
      userId: 'admin',
      permissions: permissions('SCHOOL_ADMIN'),
      isGuardian: false,
    };
    expect(childAccessPolicy.canView(subject, child)).toBe(true);
    expect(childAccessPolicy.canManageSettings(subject)).toBe(false);
  });

  it('does not treat a teacher as able to view any child by role alone', () => {
    const subject = { userId: 'teacher', permissions: permissions('TEACHER'), isGuardian: false };
    expect(childAccessPolicy.canView(subject, child)).toBe(false);
  });

  it('requires both a guardian link and the permission to manage settings', () => {
    const subject = { userId: 'parent', permissions: permissions('PARENT'), isGuardian: false };
    expect(childAccessPolicy.canManageSettings(subject)).toBe(false);
    expect(childAccessPolicy.canManageSettings({ ...subject, isGuardian: true })).toBe(true);
  });

  it('never lets a child manage their own consent, settings or guardians', () => {
    const subject = { userId: 'child-user', permissions: permissions('CHILD'), isGuardian: false };
    expect(childAccessPolicy.canManageConsent(subject)).toBe(false);
    expect(childAccessPolicy.canManageSettings(subject)).toBe(false);
    expect(childAccessPolicy.canManageGuardians(subject)).toBe(false);
  });
});

describe('canRemoveGuardian', () => {
  it('keeps at least one guardian on every child', () => {
    expect(canRemoveGuardian(1)).toBe(false);
    expect(canRemoveGuardian(2)).toBe(true);
  });
});

describe('hasAccountAccessConsent', () => {
  it('requires an unrevoked consent that covers account access', () => {
    const active = { scopes: ['ACCOUNT_ACCESS'], revokedAt: null };
    const revoked = { scopes: ['ACCOUNT_ACCESS'], revokedAt: new Date() };
    const otherScope = { scopes: ['LEARNING_ANALYTICS'], revokedAt: null };

    expect(hasAccountAccessConsent([active])).toBe(true);
    expect(hasAccountAccessConsent([revoked])).toBe(false);
    expect(hasAccountAccessConsent([otherScope])).toBe(false);
    expect(hasAccountAccessConsent([])).toBe(false);
    expect(hasAccountAccessConsent([revoked, active])).toBe(true);
  });
});
