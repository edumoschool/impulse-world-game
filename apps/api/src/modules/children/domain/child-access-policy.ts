import type { Permission } from '@impulse/contracts';

export interface ChildAccessSubject {
  userId: string;
  permissions: ReadonlySet<Permission>;
  /** Whether this user has an active guardian link to the child. */
  isGuardian: boolean;
}

export interface ChildResource {
  userId: string;
}

/**
 * Resource-level rules, applied on top of the role check at the route. A permission alone never
 * grants access to a particular child: it must be paired with a real relationship to that child.
 * Tenant isolation is enforced separately by RLS.
 */
export const childAccessPolicy = {
  canView(subject: ChildAccessSubject, child: ChildResource): boolean {
    return (
      subject.userId === child.userId ||
      subject.permissions.has('children.view_all') ||
      (subject.isGuardian && subject.permissions.has('parent.view_child_progress'))
    );
  },

  /** Settings belong to guardians. School staff manage rosters, not a child's home settings. */
  canManageSettings(subject: ChildAccessSubject): boolean {
    return subject.isGuardian && subject.permissions.has('parent.manage_child_settings');
  },

  canManageConsent(subject: ChildAccessSubject): boolean {
    if (!subject.permissions.has('parent.manage_consent')) {
      return false;
    }
    return subject.isGuardian || subject.permissions.has('children.view_all');
  },

  canManageGuardians(subject: ChildAccessSubject): boolean {
    if (!subject.permissions.has('parent.manage_guardians')) {
      return false;
    }
    return subject.isGuardian || subject.permissions.has('children.view_all');
  },
};

/** Removing the only guardian would leave no adult able to manage the child's account. */
export function canRemoveGuardian(activeGuardianCount: number): boolean {
  return activeGuardianCount > 1;
}

export interface ConsentRecord {
  scopes: readonly string[];
  revokedAt: Date | null;
}

/** A child can sign in only while some unrevoked consent covers account access. */
export function hasAccountAccessConsent(consents: readonly ConsentRecord[]): boolean {
  return consents.some(
    (consent) => consent.revokedAt === null && consent.scopes.includes('ACCOUNT_ACCESS'),
  );
}
