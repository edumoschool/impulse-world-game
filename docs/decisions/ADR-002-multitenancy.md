# ADR-002: Shared-Schema Multi-Tenancy with RLS and Three Database Roles

**Status:** Accepted, 2026-10-31

## Context

The spec requires shared PostgreSQL with tenant isolation and RLS as defence in depth. It lists `tenants` and `organizations` without relating them.

PostgreSQL's RLS has a quiet failure mode: superusers, table owners and `BYPASSRLS` roles skip it with no error. A typical setup, where the app connects as the role that ran migrations, looks protected and is not. Pooled connections add a second trap: a session-level `SET` leaks to whoever borrows the connection next.

## Decision

1. **Tenant** is the isolation and billing boundary. **Organization** is a tree inside a tenant. Each tenant has one root organization.
2. All tenants share one schema, with `tenant_id` on tenant-owned tables and composite foreign keys so a row cannot reference another tenant's parent.
3. Three roles: `impulse_owner` (migrations), `impulse_app` (requests, RLS applies), and `impulse_system` (`BYPASSRLS`, limited to reviewed code paths).
4. RLS is both `ENABLE`d and `FORCE`d, and policies read `current_setting` through helper functions that return NULL when unset, so a missing context matches no rows.
5. Tenant context is set with `set_config(name, value, true)` inside the transaction that `TenantDatabase.run()` opens.
6. A catalog test queries `pg_class` and `pg_policies`. It fails if any table with a `tenant_id` lacks forced RLS, or if the runtime role can bypass it.

## Alternatives rejected

- **Schema per tenant:** migration cost grows with tenant count, and 100,000 family tenants is impractical.
- **Database per tenant:** same problem, worse. Can be offered to a future enterprise tier, since tenancy is behind `TenantDatabase`.
- **A `bypass_rls` session variable on the app role:** any injection could set it. A separate login role cannot be escalated into from a request connection.

## Consequences

- Each request's tenant work runs in a transaction, which raises pool pressure. Transactions must stay short and must never wrap network calls.
- Two connection pools per process.
- Family tenants are cheap rows, so one per household is viable.
