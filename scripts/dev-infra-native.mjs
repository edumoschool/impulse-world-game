// Runs PostgreSQL and a Redis-compatible server without containers, for machines where Docker
// is unavailable. It uses the same ports and roles as docker-compose.yml, so nothing else changes.
// Object storage and mail are not provided here. See docs/deployment/local-development.md.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { ValkeyServer } from 'valkey-wasm';

const POSTGRES_PORT = Number(process.env.POSTGRES_HOST_PORT ?? 5544);
const REDIS_PORT = Number(process.env.REDIS_HOST_PORT ?? 6380);
const dataRoot = fileURLToPath(new URL('../.local/', import.meta.url));
const databaseDir = `${dataRoot}postgres`;
const bootstrapSql = new URL(
  '../infrastructure/compose/postgres/01-roles-and-databases.sql',
  import.meta.url,
);

mkdirSync(dataRoot, { recursive: true });
const firstRun = !existsSync(`${databaseDir}/PG_VERSION`);

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres_dev_only',
  port: POSTGRES_PORT,
  persistent: true,
  authMethod: 'password',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (message) => console.error('[postgres]', message),
});

if (firstRun) {
  await postgres.initialise();
}
await postgres.start();

if (firstRun) {
  const client = postgres.getPgClient();
  await client.connect();
  const statements = readFileSync(bootstrapSql, 'utf8')
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  // CREATE DATABASE cannot run in a multi-statement batch, so each statement goes separately.
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.end();
}

const redis = new ValkeyServer({ port: REDIS_PORT, host: '127.0.0.1' });
await redis.start();

console.log(`postgres ready on 127.0.0.1:${POSTGRES_PORT}, redis ready on 127.0.0.1:${REDIS_PORT}`);

const shutdown = async () => {
  await redis.stop();
  await postgres.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
