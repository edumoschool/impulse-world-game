# ADR-011: Native Development Stack Where Docker Is Unavailable

**Status:** Accepted, 2026-10-31

## Context

Docker Compose is the specified development environment. The first development machine has virtualization disabled, so WSL2 and Docker Desktop cannot start. Mocks are not acceptable for integration tests, because tenant isolation depends on real PostgreSQL roles and row-level security.

## Decision

`pnpm infra:native` runs real PostgreSQL through `embedded-postgres` and real Valkey through `valkey-wasm`, on the same ports and with the same roles as Compose. Application code cannot tell them apart.

Both are development dependencies only. `valkey-wasm` runs inside a WASI sandbox with no filesystem or environment access, and binds to loopback.

## Consequences

- Compose and CI remain the reference environments. CI runs real Redis.
- MinIO and Mailpit have no native equivalent here, so the S3 and SMTP adapters are only exercised where Docker runs.
- `embedded-postgres` and `valkey-wasm` are pre-1.0 or beta packages. Neither may ever reach production.
