# Production Deployment

**Not implemented.** Images, Coolify configuration and staging are Stage 11 work. This page records requirements that are already fixed.

## Before storing real child data

Open decisions O1 (data residency) and O2 (legal review) in the [repository assessment](../architecture/repository-assessment.md) must be closed.

## Database roles

Provision these before running migrations, with unique generated passwords:

```sql
CREATE ROLE impulse_owner LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE impulse_app LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE impulse_system LOGIN PASSWORD '...' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
```

The API receives `DATABASE_URL` and `SYSTEM_DATABASE_URL` only. `MIGRATION_DATABASE_URL` belongs to the release step and must never reach the running API.

## Release order

1. `prisma migrate deploy`, as `impulse_owner`.
2. The seed, which synchronises roles and permissions.
3. Start the new API and worker.

## Process start

```bash
node --import ./dist/instrument.js dist/main.js
```

`--import` is what allows tracing and Sentry to load first. Start the worker with `node dist/worker.js`.

`METRICS_TOKEN` protects `/api/v1/metrics`. Set `TRUST_PROXY_HOPS` to the number of proxies in front of the API, otherwise rate limits see the proxy's address.
