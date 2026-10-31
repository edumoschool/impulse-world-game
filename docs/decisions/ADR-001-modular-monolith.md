# ADR-001: Modular Monolith

**Status:** Accepted, 2026-10-31

## Context

The spec covers 18 logical systems but mandates one deployable to start with, and rules out microservices without an operational reason. The product needs strong transactional consistency between learning results, rewards and audit records.

## Decision

One NestJS codebase and one PostgreSQL database, with modules organised by business capability. Boundaries are enforced by tooling, not convention:

- A module exposes one `index.ts`. Importing past it fails CI.
- Each table has a single owning module, and that is checked in CI.
- Cross-module side effects travel as versioned events through the outbox.

The same image runs as `api`, `worker` and (later) `gateway`, so each can scale independently.

## Consequences

- One transaction can cover a state change and its events, with no distributed transactions.
- A module can be extracted later because its data and contracts are already separate.
- The boundaries are only as good as the checks, so the checks are part of the required CI gates.
