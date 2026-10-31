# Development Status

Last updated: 2026-10-31. Only verified work is recorded here. **The platform is not production-ready.**

## Summary

| Stage                        | State                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Engineering foundation    | Done, except the gaps listed below                                                                                             |
| 2. Identity and organization | Backend done. Web covers the family journey, MFA, invitations and workspace switching. School management screens are not built |
| 3 to 11                      | Not started                                                                                                                    |

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
- MFA setup shows no QR code, only the `otpauth://` link and the typed key. A QR code needs a library or an encoder, which was not added.
- There is no way to turn MFA off, and no recovery codes. A lost phone currently needs support, which does not exist yet.
- Invitation emails are plain English text, and only say "use this code". Someone without an account must first create a family account, then join with the code.
- In a school workspace, the dashboard still uses the family layout and wording. School management screens are Stage 2 web work that remains.

## Architecture changes this session

- ADR-001 to ADR-011 written.
- Prisma lives at `apps/api/prisma`, not inside `src`.
- `onboarding` added as a composing module that owns no tables.
- `child_preferences` and `child_devices` moved to Stage 8, because no feature needs them yet.
- TOTP implemented directly and checked against RFC vectors, rather than adding a dependency.
- Stage 6 is scheduled before Stage 5 because world unlocks depend on quests.

## Next recommended tasks

1. Confirm the `security` job passes once the CI fix reaches `main` or a pull request, then enable branch protection. Actions report that `checkout`, `setup-node` and `pnpm/action-setup` v4 target the deprecated Node 20 runtime; move them to versions built for Node 24.
2. Stage 2 remainder in the web app: school management (units, members, sending invitations), MFA recovery codes and a QR code, and localized invitation emails.
3. S3 and SMTP integration tests, on a machine with Docker.
4. Stage 3: `packages/ui`, `packages/design-tokens` and `packages/api-client`, then subjects, skills and the content lifecycle.
5. Resolve open decisions O1 and O2 before any real child data is stored.
