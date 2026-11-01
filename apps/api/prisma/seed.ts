// Synchronises reference data into the database: the permission catalogue from @impulse/contracts
// and the global education taxonomy. Idempotent, and run on every deployment before the new
// release starts. It creates no user or tenant data.
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PERMISSIONS, PLATFORM_ROLES, ROLE_KEYS, ROLE_PERMISSIONS } from '@impulse/contracts';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { GRADE_LEVELS, SUBJECTS } from './reference/education.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
});

// Global content tables force row-level security even for their owner, and the request role may
// not write global rows at all. The system role is the reviewed path for platform content.
const system = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.SYSTEM_DATABASE_URL }),
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

  await system.$transaction(async (tx) => {
    // Global rows have a null tenant_id, which a compound unique cannot match in Prisma, so
    // they are matched by code. Rows are updated in place and never deleted: content points at them.
    for (const level of GRADE_LEVELS) {
      const existing = await tx.gradeLevel.findFirst({
        where: { tenantId: null, code: level.code },
      });
      if (existing) {
        await tx.gradeLevel.update({ where: { id: existing.id }, data: level });
      } else {
        await tx.gradeLevel.create({ data: { ...level, tenantId: null } });
      }
    }
    for (const subject of SUBJECTS) {
      const existing = await tx.subject.findFirst({
        where: { tenantId: null, code: subject.code },
      });
      if (existing) {
        await tx.subject.update({ where: { id: existing.id }, data: subject });
      } else {
        await tx.subject.create({ data: { ...subject, tenantId: null } });
      }
    }
  });
}

await main();
await prisma.$disconnect();
await system.$disconnect();
