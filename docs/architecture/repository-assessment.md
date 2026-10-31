# Repository Assessment and Architecture Gap Analysis

Assessed on 2026-10-31 against `IMPULSE_WORLD_ARCHITECTURE.md` (the "spec").

## 1. Repository assessment

| Item                 | Finding                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Contents at start    | One file: `IMPULSE_WORLD_ARCHITECTURE.md`. No code, configuration, dependencies or environment files. |
| Version control      | Not a git repository at start.                                                                        |
| Existing conventions | None. Nothing needed preserving other than the spec itself.                                           |
| Existing decisions   | Only those stated in the spec.                                                                        |
| Repository root      | The spec's `impulse-world/` root maps to this directory (`game-lms`). The folder name was left alone. |

### Local toolchain

| Tool               | Version                       | Note                                                                                            |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Node.js            | 24.21.0                       | Satisfies every engine range checked.                                                           |
| pnpm               | 10.28.2                       | Workspace manager, as specified.                                                                |
| Docker             | 29.7.2                        | Docker Desktop, was stopped at assessment time.                                                 |
| git                | 2.51.0                        |                                                                                                 |
| PostgreSQL service | `PostgreSQL_For_Odoo` on 5432 | **Unrelated to this project. Do not touch.** Compose publishes this project's Postgres on 5544. |

## 2. Dependency reality check

The spec says to use stable, mutually compatible versions at implementation time. The registry differs from what the spec implies, so pins were chosen from actual peer ranges. See [ADR-004](../decisions/ADR-004-dependency-baseline.md).

| Package      | npm `latest` | Pinned | Reason                                                                            |
| ------------ | ------------ | ------ | --------------------------------------------------------------------------------- |
| typescript   | 7.0.2        | 6.0.3  | `typescript-eslint` requires `<6.1.0`; `@nestjs/swagger` requires `^5.5 \|\| ^6`. |
| prisma       | 8.0.0-rc.29  | 7.10.1 | `latest` is a release candidate. 7.10.1 is the newest stable release.             |
| phaser       | 4.2.1        | 3.90.0 | Spec names Phaser 3 explicitly.                                                   |
| @nestjs/core | 12.3.2       | 12.3.2 | Pure ESM, which sets the module format of the whole API.                          |

## 3. Gaps and defects in the spec

Each row is something the spec leaves undefined or contradicts. "Resolution" is the default adopted so work can proceed; "Open" items need a human decision and are tracked in section 4.

### 3.1 Data model

| #   | Gap                                                                                                                                                                                                                                         | Resolution                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | `tenants` and `organizations` are both listed with no defined relationship.                                                                                                                                                                 | Tenant is the isolation and billing boundary. Organization is a tree inside a tenant (root, branch, department). ADR-002.                                                          |
| G2  | Section 18 needs branches, departments, academic years, terms and schedules, but section 8 has no tables for them.                                                                                                                          | Branches and departments are `organizations` nodes. The academic calendar is added in Stage 9.                                                                                     |
| G3  | No tables listed for audit, outbox, invitations, classrooms, assignments, worlds, regions, notifications, plans, subscriptions, invoices, payment events, AI usage, feature flags or moderation, even though the spec requires all of them. | Added to the database plan with owners. See [schema-overview](../database/schema-overview.md).                                                                                     |
| G4  | A child can be both a family learner and a school student. The spec does not say whether that is one identity or two.                                                                                                                       | Default: a child profile belongs to exactly one tenant, and cross-tenant progress is not shared. Parents join the school tenant to see that record. ADR-006. **Open decision O3.** |
| G5  | Unbounded event tables (`game_session_events`, `learning_events`) are placed in the transactional database with no retention rule.                                                                                                          | Monthly range partitions through raw SQL migrations in Stage 4, with retention by dropping partitions.                                                                             |
| G6  | Deletion rights conflict with immutable audit logs.                                                                                                                                                                                         | Audit rows hold identifiers and never child names or payloads. Erasure removes the profile and leaves a pseudonymous audit trail.                                                  |

### 3.2 Behaviour

| #   | Gap                                                                                                            | Resolution                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G7  | The content lifecycle is strictly linear, with no way to reject from `IN_REVIEW`.                              | Add `IN_REVIEW → DRAFT` (changes requested) and a new-version path out of `PUBLISHED`. Published versions stay immutable.                                                     |
| G8  | The game session lifecycle shows no way into `EXPIRED` or `CANCELLED`.                                         | `CREATED`, `INITIALIZED`, `IN_PROGRESS` and `PAUSED` can each move to `EXPIRED` or `CANCELLED`. Only `VALIDATING` can move to `INVALIDATED`.                                  |
| G9  | Children aged 5 cannot be expected to type a username and password, and no child sign-in mechanism is defined. | Stage 2 uses tenant login code, username and passcode, with hard lockout. A picture-based or device-paired sign-in is needed for the youngest learners. **Open decision O4.** |
| G10 | Scoring must be server-authoritative, but offline play has no server available.                                | Offline results are provisional. The server re-scores the event log on sync and only then credits rewards.                                                                    |
| G11 | Permission names use `student.*` while the role is `Child`.                                                    | Kept as specified. The `CHILD` role holds `student.*` permissions.                                                                                                            |
| G12 | Section 11.6 lists 45 games. Building them one by one would contradict section 11.1.                           | About 10 data-driven templates (matching, sorting, sequencing, and so on). Each catalogue game is a configuration plus content, so authors can add games without developers.  |

### 3.3 Platform

| #   | Gap                                                                                                                                                     | Resolution                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G13 | How the Phaser runtime runs inside React Native is unspecified, and Phaser needs a browser canvas.                                                      | Bundled game runtime inside a WebView, with a controlled message bridge. ADR-003 (to be validated in Stage 4).         |
| G14 | No real-time gateway in the service list, although section 29.2 scales it separately.                                                                   | Same image with a `gateway` entrypoint, plus the Socket.IO Redis adapter.                                              |
| G15 | `prisma/` is shown inside `apps/api/src`.                                                                                                               | Placed at `apps/api/prisma` so migrations and seeds stay outside the compiled output.                                  |
| G16 | Three portals plus a web app multiply auth and deployment work.                                                                                         | Kept as specified, sharing `packages/ui` and `packages/api-client`. Created when their stage begins.                   |
| G17 | Row-level security silently does nothing for superusers, table owners and `BYPASSRLS` roles. A default setup would look secure while enforcing nothing. | Three separate database roles, plus a catalog test that fails the build if a tenant table lacks enforced RLS. ADR-002. |

## 4. Open decisions that need a human

Work proceeds on the stated default. None of these block Stages 1 to 3.

| ID  | Decision                                                                                                                                                                                                                          | Default in use                                                                  | Needed by                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| O1  | **Data residency.** Uzbekistan's personal data law is understood to require that citizens' personal data be held on servers physically in Uzbekistan. If confirmed, this dictates hosting and may require per-region deployments. | Single region, region-agnostic code.                                            | Before any real child data is stored |
| O2  | **Legal review** across COPPA, GDPR and Uzbek child protection law, including consent wording, retention periods and whether a school may consent on a parent's behalf.                                                           | Consent is modelled and enforced, but policy text and periods are placeholders. | Before launch                        |
| O3  | Whether one child can link family and school records across tenants.                                                                                                                                                              | Separate records.                                                               | Stage 8                              |
| O4  | Sign-in for pre-readers (picture passwords or parent-device pairing).                                                                                                                                                             | Passcode only.                                                                  | Stage 8                              |
| O5  | **Payment providers.** Stripe does not cover the Uzbek market; Payme, Click or similar likely apply.                                                                                                                              | Adapter interface only.                                                         | Stage 9                              |
| O6  | AI provider and its data-processing terms for child-related data.                                                                                                                                                                 | Adapter interface only.                                                         | Stage 7                              |
| O7  | Push and SMS providers.                                                                                                                                                                                                           | Adapter interface only.                                                         | Stage 8                              |
| O8  | Source of 3D art, audio and the initial curriculum, including Uzbek and Russian translation. A 45-game catalogue is a content project as much as an engineering one.                                                              | Engineering provides tooling; content is not generated here.                    | Stage 3 onward                       |

## 5. Architectural risks

| Risk                                                                                   | Severity | Mitigation                                                                               |
| -------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| Tenant data leak through a missed filter                                               | Critical | RLS as a second layer, catalog test, dedicated isolation suite.                          |
| Child data reaching logs, analytics or AI providers                                    | Critical | Log redaction list, pseudonymous identifiers, payload allowlists.                        |
| Reward fraud through client-supplied scores                                            | High     | Server scoring, idempotency keys, append-only ledgers.                                   |
| Connection-pool exhaustion, since RLS forces each request's queries into a transaction | High     | Keep transactions short and never hold one across external calls. Load test in Stage 11. |
| Event table growth                                                                     | High     | Partitioning (G5) and aggregation jobs.                                                  |
| Module boundaries eroding inside the monolith                                          | Medium   | Dependency-cruiser rules and the table ownership check in CI.                            |
| Scope: 18 systems, 3 client platforms and 45 games                                     | High     | Stages have acceptance criteria. Status reports only what was verified.                  |
