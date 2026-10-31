# IMPULSE WORLD

Learn. Play. Explore. An educational game universe for children aged 5 to 12, for families, learning centers and schools.

**Status: early development, not production-ready.** Stages 1 and 2 of 11 are in place. See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

## Quick start

You need Node 24 and pnpm 10. Docker is optional.

```bash
pnpm install
pnpm setup:env
pnpm infra:up
pnpm build
pnpm db:deploy
pnpm db:seed
pnpm dev
```

The web app runs at http://localhost:3000, and the API at http://localhost:4000 with OpenAPI docs at `/api/docs`.

Without Docker, run `pnpm infra:native` in a separate terminal instead of `pnpm infra:up`. It gives you PostgreSQL and a Redis-compatible server on the same ports, but no MinIO or Mailpit. See [local development](docs/deployment/local-development.md).

## Repository

| Path                    | Contents                                            |
| ----------------------- | --------------------------------------------------- |
| `apps/api`              | NestJS API, worker, Prisma schema and migrations    |
| `apps/web`              | Next.js web app                                     |
| `packages/contracts`    | Shared schemas, permissions, events and error codes |
| `packages/localization` | Uzbek, English and Russian text                     |
| `packages/config`       | Shared TypeScript and ESLint settings               |
| `docs`                  | Architecture, decisions, database and deployment    |

## Documentation

- [Architecture](ARCHITECTURE.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Development status](DEVELOPMENT_STATUS.md)
- [Decisions](DECISIONS.md)
- [Security standards](SECURITY.md)
- [Contributor guide](CLAUDE.md)
