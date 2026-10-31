# Tenancy

## Model

```text
tenant                 isolation, billing and branding boundary
└── organization       root, one per tenant
    ├── branch
    │   └── department
    └── branch
```

| Customer                 | Tenant kind                       | Structure                                                          |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| Family                   | `FAMILY`                          | One tenant, root organization only. Created on adult registration. |
| Learning center          | `LEARNING_CENTER`                 | One tenant, optional branches.                                     |
| Private or public school | `PRIVATE_SCHOOL`, `PUBLIC_SCHOOL` | One tenant, branches and departments.                              |
| Franchise                | `FRANCHISE`                       | One tenant, each location is a branch.                             |

Users are global. Access to a tenant comes from an active row in `organization_members`. One adult can be a parent in a family tenant and a teacher in a school tenant.

## How a request gets its tenant

1. The client authenticates, and the API creates a session with an active tenant taken from the user's memberships.
2. `POST /auth/switch-tenant` changes the active tenant after checking membership on the server.
3. Apart from `switch-tenant`, no endpoint accepts a tenant id from a client. Invitation tokens name a tenant, but only to route a lookup: the secret must match a row in that tenant, or nothing is found.
4. On each request, `AuthGuard` loads the session, rejects it if revoked, takes the tenant from the stored session, and re-checks membership. Removing someone from a tenant takes effect at their next request.
5. `TenantDatabase.run()` opens a transaction, sets `app.tenant_id` and `app.user_id` with `set_config(..., true)`, and runs the work. The settings are transaction-local, so they cannot leak to the next user of a pooled connection.

## Two layers of enforcement

**Layer 1, application.** Repositories filter by tenant, and domain policies check relationships (guardian to child, teacher to classroom).

**Layer 2, database.** RLS on tenant tables rejects anything Layer 1 misses. It fails closed: with no `app.tenant_id` set, policies match nothing.

RLS does not replace authorization. It stops one tenant reaching another. It does not stop a teacher in a school reading a classroom they do not teach, which is why Layer 1 is mandatory.

### Database roles

RLS is silently skipped for superusers, table owners and `BYPASSRLS` roles. Three roles exist so the normal path can never be one of those.

| Role             | Used by                                                 | Rights                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `impulse_owner`  | Migrations only                                         | Owns all tables.                                                                                                                                                                    |
| `impulse_app`    | API request handling                                    | `NOSUPERUSER NOBYPASSRLS`, not an owner. Explicit grants only.                                                                                                                      |
| `impulse_system` | Outbox relay, and platform administration from Stage 10 | `BYPASSRLS`, but no `UPDATE` or `DELETE` on audit or consent history. Reachable only through the `SystemDatabase` provider, whose use is limited by a dependency rule and reviewed. |

### Policy forms

```sql
-- Strict tenant table
USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());

-- Membership rows: a user can also see their own, across tenants
USING (tenant_id = app_current_tenant() OR user_id = app_current_user());

-- Platform-plus-tenant content (from Stage 3): global rows are read-only
USING (tenant_id IS NULL OR tenant_id = app_current_tenant());
```

## Rule checklist

| Spec rule (6.2)                     | Implementation                                                                          | Verified by                   |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| Never trust a client tenant id      | Tenant comes from the stored session; only `switch-tenant` names one, and it is checked | Isolation suite               |
| Resolve from membership             | `AuthGuard`, `switch-tenant`                                                            | Isolation suite               |
| Apply context to every query        | `TenantDatabase.run()`, with RLS failing closed                                         | Catalog test, isolation suite |
| Validate ownership before modifying | Domain policies                                                                         | Isolation suite               |
| Jobs retain tenant context          | Event envelope carries `tenantId`; consumers re-enter `TenantDatabase.run()`            | Integration test              |
| Caches include tenant identity      | `tenantCacheKey()` requires a tenant id                                                 | Unit and integration tests    |
| Object paths are tenant-aware       | `tenantObjectKey()` requires a tenant id                                                | Unit test                     |
| Test cross-tenant denial            | `apps/api/test/isolation/`                                                              | CI                            |
