import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
});
