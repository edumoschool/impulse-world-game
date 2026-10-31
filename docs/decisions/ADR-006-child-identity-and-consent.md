# ADR-006: Tenant-Scoped Child Accounts Gated by Consent

**Status:** Accepted, 2026-10-31. Open decisions O2, O3 and O4 may amend this.

## Context

Children have no email address, must be provisioned by a parent or school, and their records need guardian oversight. Consent must record the policy version and the actions authorized.

## Decision

1. A child is a `users` row with `kind = CHILD` and no email, plus a `child_profiles` row in exactly one tenant.
2. Username is unique per tenant. Sign-in takes the tenant login code, username and passcode.
3. Only adults with the right permission can provision a child. Children cannot perform account-management actions at all.
4. Data minimisation: display name, birth year (not full date of birth), locale. No photo, address or school name on the profile.
5. **Consent gates access.** A child can sign in only with an active `ACCOUNT_ACCESS` consent. Revoking it ends their sessions at once.
6. Consent rows are append-only events: policy version, scopes, basis (`PARENTAL` or `SCHOOL_AUTHORIZED`), who granted it, and when. Revocation stamps the row rather than removing it.
7. Multiple guardians are supported through `parent_child_links`. Any active guardian can revoke consent. Removing a guardian never leaves a child with none.

## Consequences

- Child data never leaves its tenant, which simplifies isolation and erasure.
- A child in both a family and a school has two records (O3).
- Passcodes are low-entropy, so they rely on per-account lockout. They are not suitable for pre-readers (O4).
- Whether a school may give consent on a parent's behalf is a legal question (O2). `SCHOOL_AUTHORIZED` records that it did, but does not establish that it is sufficient everywhere.
