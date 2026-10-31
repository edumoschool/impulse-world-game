# ADR-004: Dependency Baseline and Upgrade Policy

**Status:** Accepted, 2026-10-31

## Context

The spec asks for stable, mutually compatible, pinned versions. The newest published versions are not all compatible, and npm's `latest` tag is not always a stable release.

## Decision

| Dependency      | Pin             | Why not newer                                                                                        |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js         | 24 LTS          |                                                                                                      |
| TypeScript      | 6.0.3           | `typescript-eslint` caps at `<6.1.0`; `@nestjs/swagger` allows `^5.5 \|\| ^6`. 7.x would break both. |
| NestJS          | 12.3.2          | Pure ESM. All API code uses NodeNext modules.                                                        |
| Prisma          | 7.10.1          | `latest` points at `8.0.0-rc.29`, a release candidate.                                               |
| Next.js / React | 16.4.3 / 19.3.1 |                                                                                                      |
| PostgreSQL      | 18              |                                                                                                      |
| Phaser          | 3.90.0          | The spec names Phaser 3.                                                                             |
| Zod             | 4.x             |                                                                                                      |

Exact versions are pinned (`save-exact`), and `pnpm-lock.yaml` is committed.

## Upgrade policy

- Patch and minor upgrades monthly, through a PR that passes every CI gate.
- Security advisories rated high or critical are handled within 7 days, and `pnpm audit` runs in CI.
- Major upgrades get their own PR and, when they change architecture, a new ADR.
- Pre-release versions are never used in production paths, whichever npm tag they carry.
