# Security Standards

IMPULSE WORLD serves children aged 5 to 12. Security and privacy rules here are requirements, not guidelines. Details on tokens and tenancy are in [ADR-005](docs/decisions/ADR-005-sessions-and-tokens.md), [ADR-002](docs/decisions/ADR-002-multitenancy.md) and [ADR-006](docs/decisions/ADR-006-child-identity-and-consent.md).

## Reporting a vulnerability

Report privately to the maintainers rather than opening a public issue. Treat anything touching child data as critical.

## Coding rules

**Authentication and sessions**

- Passwords and passcodes use Argon2id. Plain hashes are never used for them.
- Raw refresh, reset and invitation tokens are never stored or logged. Only hashes are stored.
- Unknown-account paths must not be distinguishable from wrong-password paths, by response or by timing.

**Authorization**

- Default deny. Each protected route declares a permission, and a route with neither `@Public()` nor `@RequirePermissions()` fails a test.
- Role checks alone are not enough. Resource access also goes through a domain policy (guardian link, classroom relation).
- Frontend checks are for display only.

**Tenancy**

- Never accept a tenant id from a client. Contracts must not contain one.
- Tenant data goes through `TenantDatabase.run()`. `SystemDatabase` needs a code comment saying why it is required.
- Every new tenant table needs forced RLS and an isolation test.

**Input and output**

- All input is validated by a contract schema. Unknown keys are stripped.
- Request bodies are capped at 1 MB by default.
- Raw SQL uses parameter binding only, through Prisma's tagged templates.
- Errors returned to clients carry a code and a safe message, never stack traces or SQL.
- Uploads must validate MIME type by content, not extension.
- Outbound fetches to user-supplied URLs are forbidden unless they pass an allowlist (SSRF).

**Child privacy**

- Collect only what a feature needs. Adding a personal field to a child table needs a recorded justification.
- Never log child names, usernames, passcodes, emails or free text. The logger's redaction list is the enforcement point, and it must be extended with any new sensitive field.
- Events, analytics and AI payloads carry pseudonymous ids only.
- No public child profiles, no direct messaging, no targeted advertising, no selling of data.
- No loot boxes, randomized paid rewards or coin-to-money conversion.

**Secrets**

- Secrets come from the environment and are validated at boot. `.env` files are never committed.
- Development defaults exist only in `.env.example` and only for local services.

## Verification

| Control                              | Verified by               |
| ------------------------------------ | ------------------------- |
| Tenant isolation                     | `apps/api/test/isolation` |
| RLS is enforced on all tenant tables | Catalog test              |
| Runtime role cannot bypass RLS       | Catalog test              |
| Audit log is append-only             | Catalog test              |
| Refresh rotation and reuse detection | Integration tests         |
| Dependencies                         | `pnpm audit` in CI        |

## Compliance

COPPA, GDPR (including children's provisions) and Uzbekistan's personal data and child protection law apply differently and must each be reviewed by qualified counsel. **No part of this repository is a statement of legal compliance.** See open decisions O1 and O2 in the [repository assessment](docs/architecture/repository-assessment.md).
