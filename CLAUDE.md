# IMPULSE WORLD

Game-based learning platform for children aged 5 to 12, on web, Android and iOS. The master specification is [IMPULSE_WORLD_ARCHITECTURE.md](IMPULSE_WORLD_ARCHITECTURE.md). Read [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) first: it says what exists and what has been verified.

## Stack

Node 24, pnpm workspaces, Turborepo, TypeScript 6 (not 7, see ADR-004). NestJS 12 (pure ESM), Prisma 7, PostgreSQL 18, Redis, BullMQ. Next.js 16, React 19, Tailwind 4. Zod contracts in `packages/contracts`.

## Commands

```bash
pnpm install
pnpm setup:env          # creates .env with generated secrets, never overwrites
pnpm infra:up           # Docker: Postgres 5544, Redis 6380, MinIO 9100, Mailpit 1026
pnpm infra:native       # no Docker: Postgres and Valkey only, same ports
pnpm db:deploy && pnpm db:seed
pnpm dev
```

```bash
pnpm lint
pnpm typecheck
pnpm arch:check         # module boundaries and table ownership
pnpm test               # unit tests, no services needed
pnpm test:integration   # needs Postgres and Redis, uses the impulse_test database
pnpm test:e2e           # Playwright, needs `pnpm build` first
```

## Rules that must not be broken

Details are in [SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

- **Tenant data goes through `TenantDatabase.run()`.** Never accept a tenant id from a client. The only exception is `switch-tenant`, which is checked against membership.
- **Every route declares `@Public()`, `@Authenticated()` or `@RequirePermissions()`.** A route with none is denied, and a test fails.
- **Role checks are not enough.** Resource access needs a domain policy too, such as `childAccessPolicy`.
- **A module imports another only through its `index.ts`, and touches only its own tables.** Add new models to `scripts/check-table-ownership.mjs`.
- **New tenant tables need forced RLS, policies and grants in their migration.** The catalog test fails otherwise.
- **State changes and events commit together**, through `OutboxWriter.append(tx, ...)`.
- **Never put personal data in logs, events, audit metadata or metrics.** Add sensitive fields to `REDACTED_PATHS`.
- **Client code never decides scores, XP, coins or mastery.**
- **All interface text comes from `packages/localization`**, in Uzbek, English and Russian.

## Conventions

- ESM throughout: relative imports end in `.js`, even in TypeScript.
- Validation uses `ZodBody`, `ZodQuery` and `ZodParams` from `src/common/zod.ts`, with schemas from `@impulse/contracts`.
- Throw `AppError` for anything a client should see.
- Keep transactions short. Hash passwords and send email outside them.
- `createMany` for `audit_logs` and `outbox_events`. Plain `create` uses RETURNING, which RLS refuses there.
- Do not add `any`, placeholder logic or TODO comments for critical behaviour.

## Database

Three roles: `impulse_owner` (migrations), `impulse_app` (requests, RLS applies), `impulse_system` (bypasses RLS, restricted to reviewed imports).

```bash
pnpm --filter @impulse/api exec prisma migrate dev --create-only --name <change>
```

Review the SQL, add RLS and grants, then `pnpm db:migrate`. Production migrations are expand-and-contract. Reference data is synced by the seed, which runs on every deployment.

Prisma ignores partial indexes but would drop other indexes it cannot model, so check `prisma migrate diff` shows no drift. Prisma refuses `migrate reset` from an AI agent without the user's consent. Do not bypass that: write a forward migration.

## Definition of done

See spec section 37.5. Update `DEVELOPMENT_STATUS.md` after each session, and never mark something done that has not been verified. Every significant decision gets an ADR.

## Deployment

Not implemented yet. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), Stage 11, and [docs/deployment/production.md](docs/deployment/production.md).
