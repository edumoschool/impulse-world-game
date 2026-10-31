// Synchronises the permission catalogue in @impulse/contracts into the database. Idempotent, and
// run on every deployment before the new release starts. It creates no user or tenant data.
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PERMISSIONS, PLATFORM_ROLES, ROLE_KEYS, ROLE_PERMISSIONS } from '@impulse/contracts';
import { PrismaClient } from '../src/generated/prisma/client.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
});

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const key of PERMISSIONS) {
      await tx.permission.upsert({ where: { key }, create: { key }, update: {} });
    }
    await tx.permission.deleteMany({ where: { key: { notIn: [...PERMISSIONS] } } });

    for (const key of ROLE_KEYS) {
      const scope = PLATFORM_ROLES.includes(key) ? 'PLATFORM' : 'TENANT';
      const role = await tx.role.upsert({
        where: { key },
        create: { key, scope },
        update: { scope },
      });
      const permissions = await tx.permission.findMany({
        where: { key: { in: [...ROLE_PERMISSIONS[key]] } },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }
  });
}

await main();
await prisma.$disconnect();
