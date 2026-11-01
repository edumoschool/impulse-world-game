import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Applies migrations and the seed exactly as a deployment would, against the test database. */
export default function globalSetup(): void {
  const rootEnv = new URL('../../../../.env', import.meta.url);
  if (existsSync(rootEnv)) {
    process.loadEnvFile(rootEnv);
  }
  const onTestDatabase = (value: string | undefined) => {
    const url = new URL(value ?? '');
    url.pathname = '/impulse_test';
    return url.toString();
  };
  // The seed writes global content through the system role, so both connections must move.
  const env = {
    ...process.env,
    MIGRATION_DATABASE_URL: onTestDatabase(process.env.MIGRATION_DATABASE_URL),
    SYSTEM_DATABASE_URL: onTestDatabase(process.env.SYSTEM_DATABASE_URL),
  };

  const run = (command: string) => execSync(command, { cwd: apiRoot, env, stdio: 'pipe' });
  try {
    run('pnpm exec prisma migrate deploy');
    run('pnpm exec tsx prisma/seed.ts');
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`Test database setup failed:\n${failure.stdout}\n${failure.stderr}`, {
      cause: error,
    });
  }
}
