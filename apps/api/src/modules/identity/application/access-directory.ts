import type { Permission, TenantMembership } from '@impulse/contracts';

/**
 * What identity needs to know about memberships and roles. Identity defines this port and
 * `organizations` implements it, which keeps identity free of any dependency on organizations.
 */
export abstract class AccessDirectory {
  /** Every tenant the user can act in, in a stable order. */
  abstract listMemberships(userId: string): Promise<TenantMembership[]>;

  /** Effective permissions, or null when the user has no active membership of the tenant. */
  abstract resolvePermissions(
    userId: string,
    tenantId: string | null,
  ): Promise<ReadonlySet<Permission> | null>;
}
