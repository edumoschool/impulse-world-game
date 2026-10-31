import { Injectable } from '@nestjs/common';
import type { Permission, RoleKey } from '@impulse/contracts';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';

interface CatalogEntry {
  id: string;
  key: RoleKey;
  permissions: Permission[];
}

/**
 * Roles and permissions only change on deployment, when the seed runs before the new release
 * starts, so one in-process copy is safe and avoids extra queries on every request.
 */
@Injectable()
export class RoleCatalog {
  private entries: Promise<CatalogEntry[]> | undefined;

  constructor(private readonly database: TenantDatabase) {}

  async roleId(key: RoleKey): Promise<string> {
    const entry = (await this.load()).find((role) => role.key === key);
    if (!entry) {
      throw new Error(`Role ${key} is missing. Run the database seed.`);
    }
    return entry.id;
  }

  async keysFor(roleIds: string[]): Promise<RoleKey[]> {
    const entries = await this.load();
    return entries.filter((role) => roleIds.includes(role.id)).map((role) => role.key);
  }

  async permissionsFor(roleIds: string[]): Promise<Set<Permission>> {
    const entries = await this.load();
    return new Set(
      entries.filter((role) => roleIds.includes(role.id)).flatMap((role) => role.permissions),
    );
  }

  private load(): Promise<CatalogEntry[]> {
    this.entries ??= this.database.global.role
      .findMany({ include: { permissions: { include: { permission: true } } } })
      .then((roles) =>
        roles.map((role) => ({
          id: role.id,
          key: role.key as RoleKey,
          permissions: role.permissions.map((link) => link.permission.key as Permission),
        })),
      )
      .catch((error: unknown) => {
        this.entries = undefined;
        throw error;
      });
    return this.entries;
  }
}
