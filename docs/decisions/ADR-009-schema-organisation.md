# ADR-009: Multi-File Prisma Schema with Single-Owner Tables

**Status:** Accepted, 2026-10-31

## Decision

The Prisma schema is split into one file per domain group under `apps/api/prisma/schema/`. `scripts/check-table-ownership.mjs` maps each Prisma model to its owning module and fails CI when a module accesses another module's model.

## Consequences

- A single file for 150+ tables would be unreviewable, and ownership is visible from the file layout.
- Foreign keys still cross domains. They are allowed inside the monolith, but they must be dropped if a module is extracted.
