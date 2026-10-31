# ADR-010: Workspace Packages Are Created When They Have Content

**Status:** Accepted, 2026-10-31

## Context

The spec's monorepo tree lists seven apps and fourteen packages. Creating them all as empty folders would suggest progress that does not exist.

## Decision

The tree is the target. A package or app is created in the stage that gives it real content. `ARCHITECTURE.md` marks the rest as planned, and each has a stage assigned in `IMPLEMENTATION_PLAN.md`.

## Consequences

- The repository always reflects what exists.
- `packages/contracts` carries shared types for now, and `shared-types` and `validation` are merged into it. They can be split later if a real need appears.
