import { Injectable } from '@nestjs/common';
import type { Permission, TenantMembership } from '@impulse/contracts';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { AccessDirectory, RoleCatalog } from '../../identity/index.js';
import { TenantService } from '../../tenants/index.js';

@Injectable()
export class OrganizationAccessDirectory extends AccessDirectory {
  constructor(
    private readonly database: TenantDatabase,
    private readonly roles: RoleCatalog,
    private readonly tenants: TenantService,
  ) {
    super();
  }

  /** Relies on the RLS clause that lets a user read their own membership rows across tenants. */
  async listMemberships(userId: string): Promise<TenantMembership[]> {
    const memberships = await this.database.run({ userId }, (tx) =>
      tx.organizationMember.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
    );
    const tenants = await this.tenants.getMany(memberships.map((row) => row.tenantId));
    return tenants
      .filter((tenant) => tenant.status === 'ACTIVE')
      .map((tenant) => ({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantKind: tenant.kind,
        loginCode: tenant.loginCode,
      }));
  }

  async resolvePermissions(
    userId: string,
    tenantId: string | null,
  ): Promise<ReadonlySet<Permission> | null> {
    const { member, roleIds } = await this.database.run({ tenantId, userId }, async (tx) => {
      const member = tenantId
        ? await tx.organizationMember.findFirst({
            where: { tenantId, userId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null;
      // A null tenant_id is a platform grant, which applies whichever tenant is active.
      const scopes = member ? [{ tenantId }, { tenantId: null }] : [{ tenantId: null }];
      const grants = await tx.userRole.findMany({
        where: { userId, OR: scopes },
        select: { roleId: true },
      });
      return { member, roleIds: grants.map((grant) => grant.roleId) };
    });
    if (tenantId && !member) {
      return null;
    }
    return this.roles.permissionsFor(roleIds);
  }
}
