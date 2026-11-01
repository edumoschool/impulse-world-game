# Architecture Decisions

Every major architecture decision has an ADR in [docs/decisions/](docs/decisions/). An accepted ADR is changed by writing a new one that supersedes it.

| ADR                                                               | Decision                                                            | Status                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| [001](docs/decisions/ADR-001-modular-monolith.md)                 | Modular monolith with enforced boundaries                           | Accepted                         |
| [002](docs/decisions/ADR-002-multitenancy.md)                     | Shared schema, RLS, three database roles                            | Accepted                         |
| [003](docs/decisions/ADR-003-game-runtime.md)                     | Data-driven, server-authoritative game runtime                      | Accepted, mobile bridge unproven |
| [004](docs/decisions/ADR-004-dependency-baseline.md)              | Dependency baseline and upgrade policy                              | Accepted                         |
| [005](docs/decisions/ADR-005-sessions-and-tokens.md)              | Short JWTs with rotating opaque refresh tokens                      | Accepted                         |
| [006](docs/decisions/ADR-006-child-identity-and-consent.md)       | Child accounts are tenant-scoped and consent-gated                  | Accepted, O3 and O4 open         |
| [007](docs/decisions/ADR-007-transactional-outbox.md)             | Transactional outbox for domain events                              | Accepted                         |
| [008](docs/decisions/ADR-008-contracts-and-validation.md)         | Zod contracts shared through one package                            | Accepted                         |
| [009](docs/decisions/ADR-009-schema-organisation.md)              | Multi-file Prisma schema with single-owner tables                   | Accepted                         |
| [010](docs/decisions/ADR-010-incremental-workspace.md)            | Workspace packages created only when they have content              | Accepted                         |
| [011](docs/decisions/ADR-011-native-development-stack.md)         | Native development stack where Docker is unavailable                | Accepted                         |
| [012](docs/decisions/ADR-012-mfa-recovery-and-lost-membership.md) | MFA recovery codes, and sessions that lose their tenant             | Accepted                         |
| [013](docs/decisions/ADR-013-education-content-model.md)          | Education content: lifecycle, version pinning, localized JSONB text | Accepted                         |

## Assumptions

Reasonable defaults taken without clarification, as instructed. Open items that need a human are in the [repository assessment](docs/architecture/repository-assessment.md#4-open-decisions-that-need-a-human).

- This directory is the repository root.
- Node 24 LTS and PostgreSQL 18 are the runtime baseline.
- Express is the NestJS HTTP platform.
- Self-service creation of institutional tenants is allowed until Stage 9 adds billing checks.
- Default child access token and session lifetimes match adults'. Tighter limits may follow legal review.
