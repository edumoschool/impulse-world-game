# Development Status

Last updated: 2026-11-01. Only verified work is recorded here. **The platform is not production-ready.**

## Summary

| Stage                        | State                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Engineering foundation    | Done, except the gaps listed below                                                                                                                       |
| 2. Identity and organization | Done, pending native-speaker review of Uzbek and Russian text and legal review of consent wording                                                        |
| 3. Education core            | In progress: content model, lifecycle, curriculum catalog and answer checking done. Lessons, question banks, assessments, progress and learner UI remain |
| 4 to 11                      | Not started                                                                                                                                              |

## Verified on 2026-10-31

Run on Windows against real PostgreSQL 18 and Valkey 9.1 through `pnpm infra:native`. Docker could not run on this machine (see known issues).

| Check                              | Result                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `pnpm build`                       | Pass                                                                 |
| `pnpm lint`                        | Pass                                                                 |
| `pnpm typecheck`                   | Pass                                                                 |
| `pnpm arch:check`                  | Pass, and confirmed to fail on a deliberate violation                |
| `prisma migrate diff`              | No drift                                                             |
| `pnpm test`                        | 108 passed                                                           |
| `pnpm test:integration`            | 150 passed                                                           |
| `pnpm test:e2e`                    | 18 passed                                                            |
| `pnpm audit --prod`                | No high or critical. 4 moderate, all transitive (`glob` and similar) |
| E2E on Chromium, desktop and phone | 9 journeys per viewport, 18 runs                                     |

### Second session, 2026-10-31

Run in a Linux container on Node 24.22, against PostgreSQL 18 (`embedded-postgres`) and Valkey through `pnpm infra:native`, with Chromium from the container.

| Check                   | Result                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm format:check`     | Pass                                                             |
| `pnpm lint`             | Pass                                                             |
| `pnpm typecheck`        | Pass                                                             |
| `pnpm arch:check`       | Pass                                                             |
| `prisma migrate diff`   | No drift                                                         |
| `pnpm test`             | 108 passed                                                       |
| `pnpm test:integration` | 151 passed                                                       |
| `pnpm test:e2e`         | 24 passed. The 3 new journeys also passed 4 repeats per viewport |

### Third session, 2026-11-01

Same environment as the second session.

| Check                   | Result                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| `pnpm format:check`     | Pass                                                                           |
| `pnpm lint`             | Pass                                                                           |
| `pnpm typecheck`        | Pass                                                                           |
| `pnpm arch:check`       | Pass (25 models)                                                               |
| `prisma migrate diff`   | No drift after the `mfa_recovery_codes` and `invitation_revocation` migrations |
| `pnpm test`             | 115 passed                                                                     |
| `pnpm test:integration` | 163 passed                                                                     |
| `pnpm test:e2e`         | 34 passed. The account and school journeys also passed 3 repeats per viewport  |
| `pnpm audit --prod`     | No high or critical. Still 4 moderate, all transitive                          |

### Fourth session, 2026-11-01 (Stage 3, first slice)

Same environment.

| Check                   | Result                                            |
| ----------------------- | ------------------------------------------------- |
| format, lint, typecheck | Pass                                              |
| `pnpm arch:check`       | Pass (29 models)                                  |
| `prisma migrate diff`   | No drift after the `education_taxonomy` migration |
| `pnpm test`             | 145 passed                                        |
| `pnpm test:integration` | 171 passed                                        |
| `pnpm test:e2e`         | 34 passed                                         |

CI on PR #2: runs 4 and 5 passed, including the move to the Node 24 releases of the GitHub actions.

CI on `main` after the fix (run 3, commit `c41d076`): both `verify` and `security` passed.

**GitHub Actions, first run (run 1, commit `11c6d25`):** the `verify` job passed every step on Ubuntu with PostgreSQL 18 and Redis 8 service containers: format, build, lint, typecheck, arch check, unit tests, migrate and seed, drift check, integration tests and e2e. This also verifies the integration suite on real Redis. The `security` job's audit passed, but the job failed in setup-node's post step, which tried to save a pnpm cache for a job that never installs. The cache was removed from that job; the fix has not yet run in CI, because the workflow only triggers on pushes to `main` and on pull requests.

## Completed

**Foundation:** pnpm and Turborepo monorepo, strict TypeScript, ESLint, Prettier. Validated configuration that refuses to boot on weak secrets. Three-role database access. Transaction-scoped tenant context. Response envelope, error filter, request ids. Pino logging with redaction. Prometheus metrics, health checks, Sentry and OpenTelemetry hooks. Redis rate limiting. Tenant-scoped cache and object keys. Transactional outbox, relay, BullMQ publisher, idempotent consumers, worker process. Dependency and table-ownership rules. GitHub Actions workflow.

**Identity and organization:** family registration, adult sign-in, child sign-in, refresh rotation with reuse detection, cookie and bearer transports with CSRF, session list and revocation, tenant switching, password recovery, TOTP MFA with encrypted secrets and replay protection, default-deny access rules, RBAC catalogue, institutions, branches, departments, memberships, invitations, child provisioning, consent, guardians, child settings, append-only audit log, isolation test suite.

**Web:** sign-in for adults and children, registration, password recovery, family dashboard, add child, settings, consent withdrawal, language switching in Uzbek, English and Russian.

**Web, second session:**

- Sign-in asks for an authenticator code when the account has one, and explains a wrong or reused code.
- An account security page turns on two-step sign-in, with an `otpauth://` link and a typed setup key.
- An invitation page accepts the emailed code, then opens the new workspace.
- A workspace switcher appears for adults in more than one family or school.
- The session view now reports `mfaEnabled`, covered by an integration test.
- The e2e suite runs a small SMTP sink, so the invitation journey reads the real email the API sends. If the SMTP port is taken, for example by Mailpit, that one test is skipped.

**Third session (Stage 2 completed):**

- MFA recovery codes: ten single-use codes when MFA is turned on, sign-in with a recovery code, a new set on demand, and turning MFA off with the password and a second factor (ADR-012). New table `user_mfa_recovery_codes`.
- The MFA setup page draws a QR code in the browser.
- Password reset and invitation emails come from `packages/localization`, in the recipient's language for resets and the inviter's for invitations. The invitation email names the school and carries a link to the accept page.
- Sign-in and registration keep a safe `next` return path, so an invitation link survives signing up. A path to another site is ignored, and an e2e test covers it.
- School screens: set up a school, see its structure as a tree, add branches and departments, list and remove people, and invite staff by role and unit. Each part appears only with its permission, and family workspaces do not show it.
- Sent invitations are listed and can be cancelled (new nullable `revoked_at` column, expand-only). A cancelled code is refused.
- Removing the last owner now returns `LAST_OWNER`, with a translated message.
- **Fixed:** the member list showed the viewer's own memberships from other tenants, because RLS lets users read their own rows everywhere. The queries now filter by tenant, and a regression test failed before the fix.
- **Fixed:** a member removed from their active school was locked out of every request, including sign-out. The guard now moves the session to a tenant they still belong to, and still refuses requests meant for the old tenant (ADR-012).

**Stage 3, first slice:**

- ADR-013 sets the content model: taxonomy versus versioned teaching material, the lifecycle, version pinning, localized JSONB text, and answer checking.
- The content lifecycle is one pure state machine. Authors can never approve or publish their own version, only drafts can be edited, and a rejection needs a reason. Unit tests cover each rule.
- Curriculum catalog: grade levels and the six core subjects are seeded as global rows through the system role, and schools add their own subjects, skills and prerequisites. Global rows are read-only to the request role, which an integration test checks with direct queries. References to another school's subject or skill are refused, because foreign keys ignore RLS. Prerequisite loops are refused.
- Answer checking for all 11 question types, with partial credit where it fits, an author-time consistency check, and a learner view that strips the answer key and shuffles revealing orders. 18 unit tests.
- The test setup now runs the seed's system-role connection against `impulse_test` too.

## Not verified

| Item                     | Why                                                              | How to verify                                    |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------ |
| `docker-compose.yml`     | Docker cannot start here                                         | `pnpm infra:up` on a machine with virtualization |
| `S3ObjectStorage`        | No MinIO available. Key building is tested; the adapter is not   | Needs an integration test against MinIO          |
| `SmtpEmailSender`        | No SMTP server available. Tests capture mail at the port         | Send through Mailpit                             |
| OpenTelemetry and Sentry | Only proven to stay off by default. Never connected to a backend | Set the env vars in staging                      |

## Known issues

- Docker Desktop and WSL2 cannot start on the current machine, because hardware virtualization is off (`HCS_E_HYPERV_NOT_INSTALLED`).
- Uzbek and Russian text is a machine-assisted draft and needs native review before any release.
- Consent wording and `POLICY_VERSION` are placeholders until legal review.
- There are no production consumers of domain events yet. The relay and dispatcher are tested with test consumers.
- `prom-client` 15.1.3 is reported as deprecated by the registry. Its replacement should be checked.
- Password reset and invitation emails are sent inline or fire-and-forget, with no retry. They should move to BullMQ with Notifications in Stage 8.
- The web app has no full Content-Security-Policy yet, only `frame-ancestors`.
- Refresh token reuse in a shared browser profile across tabs relies on the 10-second grace window. Not tested in a real multi-tab scenario.
- No platform-administration routes exist yet, so MFA enforcement is proven at the guard level, not through a real route.
- No admin bootstrap exists. The first platform administrator has to be granted through the system role by hand.
- In a school workspace, the dashboard still lists children under the family heading. School-specific child and class views belong to later stages.
- Adults can turn MFA off themselves. Once platform administration exists, accounts that must use MFA need a rule against that (ADR-012).
- Rotating `AUTH_ENCRYPTION_KEY` invalidates TOTP secrets and recovery codes. Key rotation needs a plan before production.
- Emails are plain text, with no HTML version.
- The new Uzbek and Russian text, including emails, is also a machine-assisted draft.

## Architecture changes this session

- ADR-001 to ADR-011 written. ADR-012 added in the third session.
- Prisma lives at `apps/api/prisma`, not inside `src`.
- `onboarding` added as a composing module that owns no tables.
- `child_preferences` and `child_devices` moved to Stage 8, because no feature needs them yet.
- TOTP implemented directly and checked against RFC vectors, rather than adding a dependency.
- Stage 6 is scheduled before Stage 5 because world unlocks depend on quests.

## Next recommended tasks

1. Stage 3, next slices: question banks and versioned questions through the lifecycle API, then lessons and learning paths, then assessments with attempts pinned to versions, then progress and mastery from multiple observations, then the authoring and learner screens.
2. Enable branch protection on `main`.
3. Native-speaker review of all Uzbek and Russian text, including the emails and seeded subject names, and legal review of the consent wording.
4. S3 and SMTP integration tests, on a machine with Docker.
5. Resolve open decisions O1 and O2 before any real child data is stored.
