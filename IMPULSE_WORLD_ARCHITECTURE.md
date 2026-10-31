# IMPULSE WORLD
## Enterprise EdTech & Gamified Learning Platform
### Master Architecture, System Design & Engineering Specification

**Document Type:** Software Architecture & Engineering Master Specification  
**Product:** IMPULSE WORLD  
**Target Audience:** Children aged 5–12  
**Platforms:** Web, Android, iOS  
**Architecture:** Modular Monolith, Domain-Driven Design, API-First  
**Backend:** NestJS + TypeScript  
**Web:** Next.js + TypeScript  
**Mobile:** React Native + Expo  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Cache:** Redis  
**Storage:** S3-compatible object storage  
**Game Framework:** Phaser 3 + Three.js  
**Deployment:** Docker + Coolify / Kubernetes-ready infrastructure  

---

# 1. PROJECT VISION

## 1.1 Product Definition

IMPULSE WORLD is a comprehensive game-based educational ecosystem designed for children aged 5–12.

It combines:

- Game-based learning.
- Personalized educational pathways.
- Interactive mini-games.
- Virtual exploration.
- Adaptive assessments.
- AI-assisted learning.
- Gamification.
- Parent supervision.
- Teacher and classroom management.
- School management.
- Educational analytics.
- Multi-tenant institutional management.

The product must not behave like a traditional LMS with games attached.

It must behave like an educational game universe where learning is the central gameplay mechanic.

## 1.2 Product Principles

1. Education first, entertainment second.
2. Every game must have measurable learning objectives.
3. Content must adapt to the learner's demonstrated ability.
4. Rewards must encourage learning, not compulsive usage.
5. Children must have a safe and age-appropriate environment.
6. Parents and teachers must have meaningful oversight.
7. Educational content must be manageable without developer intervention.
8. The system must support multiple languages.
9. The architecture must support multiple schools and educational organizations.
10. Every important operation must be auditable.

## 1.3 Product Roles

Implement the following roles:

| Role | Capabilities |
|---|---|
| Child | Learning, games, avatar, progress |
| Parent | Child supervision, progress, account controls |
| Teacher | Classes, assignments, assessment |
| School Admin | Students, teachers, classrooms |
| Content Creator | Educational content creation |
| Content Reviewer | Content approval and moderation |
| Organization Owner | Organization settings and billing |
| Platform Admin | Global platform management |
| Support Agent | Authorized customer support |

Use RBAC combined with resource-level authorization.

Never rely exclusively on frontend role checks.

---

# 2. SYSTEM ARCHITECTURE

## 2.1 Architectural Strategy

Use a modular monolith as the initial production architecture.

Do not introduce microservices without a clear operational or scaling requirement.

The application must have strict domain boundaries, independent module contracts, asynchronous events and replaceable infrastructure adapters.

The system should be microservice-extraction-ready.

## 2.2 High-Level Architecture

```text
                    CLIENT APPLICATIONS
                            |
          +-----------------+------------------+
          |                 |                  |
       NEXT.JS          EXPO MOBILE         ADMIN WEB
       WEB APP           ANDROID/iOS         PORTAL
          |                 |                  |
          +-----------------+------------------+
                            |
                       API LAYER
                            |
                    NESTJS APPLICATION
                            |
       +--------------------+----------------------+
       |                    |                      |
   IDENTITY              LEARNING                GAME
   DOMAIN                DOMAIN                 DOMAIN
       |                    |                      |
       +--------------------+----------------------+
                            |
                    APPLICATION EVENTS
                            |
       +--------------------+----------------------+
       |                    |                      |
    POSTGRESQL             REDIS                BULLMQ
       |                    |                      |
       +--------------------+----------------------+
                            |
                  OBJECT STORAGE / CDN
                            |
                ANALYTICS / OBSERVABILITY
```

## 2.3 System Boundaries

Separate the platform into these logical systems:

1. Identity and Access Management.
2. Organization and Tenant Management.
3. Learner Management.
4. Parent Management.
5. Teacher and Classroom Management.
6. Educational Content Management.
7. Learning Management.
8. Game Runtime and Game Engine.
9. Assessment Engine.
10. Adaptive Learning Engine.
11. Gamification Engine.
12. Virtual World Engine.
13. AI Services.
14. Subscription and Billing.
15. Notifications.
16. Analytics and Reporting.
17. Safety and Moderation.
18. Platform Administration.

Each domain must own its business logic and data access.

---

# 3. TECHNOLOGY STACK

Use stable, mutually compatible versions at implementation time. Pin dependencies and maintain a dependency upgrade policy.

## 3.1 Frontend

### Web Application

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui or an equivalent accessible component system
- TanStack Query
- Zustand
- React Hook Form
- Zod

### Mobile Application

- React Native
- Expo
- TypeScript
- Expo Router
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Expo SQLite for local persistence where appropriate

### Game Runtime

- Phaser 3 for 2D mini-games.
- Three.js for selected 3D interactive experiences.
- Shared game contracts and schemas.
- Canvas rendering with accessible fallback interfaces.

Avoid using a heavy 3D scene for ordinary learning exercises.

## 3.2 Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- REST API
- OpenAPI / Swagger
- Zod or class-validator at request boundaries

## 3.3 Infrastructure

- Docker
- Docker Compose for development
- Coolify for initial production deployment
- S3-compatible storage / MinIO
- CDN
- GitHub Actions
- Sentry
- OpenTelemetry
- Prometheus-compatible metrics
- Grafana

Design infrastructure adapters so Kubernetes deployment remains possible without rewriting business logic.

---

# 4. MONOREPO ARCHITECTURE

Use pnpm workspaces and Turborepo.

Recommended repository:

```text
impulse-world/
│
├── apps/
│   ├── api/
│   ├── web/
│   ├── mobile/
│   ├── admin/
│   ├── parent-portal/
│   ├── teacher-portal/
│   └── storybook/
│
├── packages/
│   ├── shared-types/
│   ├── api-client/
│   ├── contracts/
│   ├── validation/
│   ├── ui/
│   ├── design-tokens/
│   ├── game-engine/
│   ├── game-sdk/
│   ├── game-registry/
│   ├── learning-sdk/
│   ├── analytics-sdk/
│   ├── localization/
│   ├── config/
│   └── testing/
│
├── infrastructure/
│   ├── docker/
│   ├── compose/
│   ├── nginx/
│   ├── monitoring/
│   ├── backup/
│   └── deployment/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── security/
│   ├── game-engine/
│   ├── content/
│   ├── deployment/
│   └── decisions/
│
├── scripts/
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## 4.1 Repository Rules

- Use strict TypeScript.
- Avoid `any`.
- Do not duplicate API contracts.
- Share validation schemas where practical.
- Separate server-only and client-only code.
- Never import backend database packages into mobile or web applications.
- Use explicit package exports.
- Maintain dependency boundaries.
- Add architecture linting to CI.
- Avoid circular dependencies.

---

# 5. BACKEND DOMAIN MODULES

NestJS modules must be organized by business capability.

```text
apps/api/src/
│
├── main.ts
├── app.module.ts
│
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   ├── pipes/
│   ├── middleware/
│   ├── exceptions/
│   └── utils/
│
├── infrastructure/
│   ├── database/
│   ├── cache/
│   ├── storage/
│   ├── queue/
│   ├── email/
│   ├── sms/
│   ├── events/
│   └── telemetry/
│
├── modules/
│   ├── identity/
│   ├── tenants/
│   ├── organizations/
│   ├── users/
│   ├── children/
│   ├── guardians/
│   ├── teachers/
│   ├── classrooms/
│   ├── enrollment/
│   ├── curriculum/
│   ├── subjects/
│   ├── worlds/
│   ├── learning-paths/
│   ├── lessons/
│   ├── content/
│   ├── questions/
│   ├── assessments/
│   ├── learning-progress/
│   ├── adaptive-learning/
│   ├── game-engine/
│   ├── game-catalog/
│   ├── game-sessions/
│   ├── quests/
│   ├── achievements/
│   ├── rewards/
│   ├── inventory/
│   ├── avatars/
│   ├── leaderboards/
│   ├── social/
│   ├── ai/
│   ├── subscriptions/
│   ├── billing/
│   ├── notifications/
│   ├── analytics/
│   ├── reports/
│   ├── safety/
│   ├── moderation/
│   ├── support/
│   ├── audit/
│   └── administration/
│
└── prisma/
    ├── schema.prisma
    ├── migrations/
    └── seed/
```

Every module must follow this internal organization:

```text
module-name/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   ├── repositories/
│   └── services/
│
├── application/
│   ├── commands/
│   ├── queries/
│   ├── handlers/
│   └── use-cases/
│
├── infrastructure/
│   ├── persistence/
│   ├── adapters/
│   └── mappers/
│
├── presentation/
│   ├── controllers/
│   ├── dto/
│   └── guards/
│
└── module-name.module.ts
```

Do not create unnecessary abstractions for trivial features. Apply domain-driven design where it provides clear value.

---

# 6. MULTI-TENANT ARCHITECTURE

The system must support:

- Individual family accounts.
- Independent learning centers.
- Private schools.
- Public schools.
- Educational franchises.
- Multiple branches under one organization.

## 6.1 Tenant Model

Use shared PostgreSQL infrastructure with tenant-aware data isolation as the default.

Each tenant-owned entity must have a `tenant_id` where applicable.

Implement:

- Tenant resolution.
- Tenant context propagation.
- Tenant-aware repository queries.
- Tenant-aware background jobs.
- Tenant-aware file access.
- Tenant-level quotas.
- Tenant-level billing.
- Tenant-level audit logs.
- Tenant-level branding.

Use PostgreSQL Row-Level Security as defense in depth for suitable tenant-owned tables.

Do not assume RLS alone solves authorization.

Platform-global records must be explicitly separated from tenant-owned records.

## 6.2 Tenant Isolation Rules

1. Never trust a tenant ID supplied by an ordinary client.
2. Resolve tenant access from authenticated membership and resource authorization.
3. Apply tenant context to every tenant-scoped query.
4. Validate ownership before modifying a resource.
5. Ensure jobs retain tenant context.
6. Ensure caches include tenant identity in their keys.
7. Ensure object-storage paths are tenant-aware.
8. Test cross-tenant access denial.

Provide a dedicated isolation test suite.

---

# 7. IDENTITY AND AUTHENTICATION

## 7.1 Authentication

Support:

- Email and password for adults.
- Parent-controlled child accounts.
- School-managed accounts.
- Secure session management.
- Refresh token rotation.
- Account recovery for adults.
- Optional OAuth providers.
- Device/session management.

Children must not be required to have personal email addresses.

A parent or school administrator may provision child accounts.

## 7.2 Security

Implement:

- Argon2id password hashing.
- Short-lived access tokens.
- Rotating refresh tokens.
- Refresh token reuse detection.
- Secure HTTP-only cookies for web sessions.
- Secure token storage on mobile.
- CSRF protection where cookie authentication requires it.
- Rate limiting.
- Brute-force protection.
- Session revocation.
- MFA for privileged administrators.
- Login and security audit events.

Never store raw refresh tokens.

## 7.3 Authorization

Use:

- RBAC for roles.
- Resource-level authorization.
- Tenant membership validation.
- Parent-child relationship validation.
- Teacher-classroom relationship validation.
- Explicit permission checks.

Example permissions:

```text
student.learn
student.play
student.view_own_progress

parent.view_child_progress
parent.manage_child_settings

teacher.manage_class
teacher.assign_learning_path
teacher.review_submissions

content.create
content.edit
content.submit_for_review
content.publish

organization.manage_members
organization.manage_billing

platform.manage_tenants
platform.manage_users
platform.manage_content
platform.view_audit_logs
```

---

# 8. CORE DATABASE ARCHITECTURE

Use PostgreSQL with UUID primary keys.

Use `timestamptz` for timestamps and UTC internally.

Use explicit indexes, foreign keys, unique constraints and transaction boundaries.

Avoid storing core relational data exclusively inside JSON columns.

JSONB is appropriate for versioned game configurations, flexible metadata and provider-specific payloads.

## 8.1 Identity Tables

```text
users
user_profiles
user_credentials
user_sessions
refresh_tokens
roles
permissions
role_permissions
user_roles
organizations
organization_members
tenants
tenant_settings
```

## 8.2 Child and Family Tables

```text
child_profiles
parent_profiles
parent_child_links
child_consents
child_preferences
child_devices
child_settings
```

A parent-child relationship must support multiple authorized guardians.

Consent records must capture the applicable policy version and the actions authorized.

## 8.3 Education Tables

```text
subjects
subject_translations
curriculums
curriculum_versions
grade_levels
learning_objectives
skills
skill_dependencies
learning_paths
learning_path_versions
learning_path_nodes
units
lessons
lesson_versions
lesson_blocks
lesson_assets
learning_enrollments
learning_progress
```

Every published educational resource must have an immutable version.

Historical assessment results must retain their original content version.

## 8.4 Content Tables

```text
content_items
content_versions
content_translations
content_assets
content_categories
content_tags
content_reviews
content_approvals
content_publications
content_localizations
```

Content lifecycle:

```text
DRAFT
  |
IN_REVIEW
  |
APPROVED
  |
PUBLISHED
  |
ARCHIVED
```

Only authorized reviewers may approve publication.

Published content must not be silently modified.

## 8.5 Assessment Tables

```text
question_banks
questions
question_versions
question_options
assessment_templates
assessment_versions
assessment_items
assessment_attempts
assessment_responses
assessment_results
assessment_rubrics
```

Support:

- Multiple choice.
- Multiple select.
- True/false.
- Matching.
- Ordering.
- Drag and drop.
- Fill in the blank.
- Short text.
- Audio response.
- Image-based questions.
- Interactive scenarios.

## 8.6 Game Tables

```text
game_templates
game_versions
game_categories
game_modes
game_sessions
game_session_events
game_results
game_content_bindings
game_attempts
game_unlocks
```

Game templates must be versioned.

A game session must reference the exact game version used.

## 8.7 Gamification Tables

```text
player_profiles
player_levels
player_experience
experience_transactions
wallets
wallet_transactions
reward_catalog
reward_redemptions
achievements
achievement_conditions
player_achievements
quests
quest_steps
quest_assignments
quest_progress
inventory_items
player_inventory
avatar_definitions
player_avatars
streak_records
leaderboards
leaderboard_entries
```

Never update a coin or XP balance without recording the corresponding transaction.

Use idempotency keys for reward operations.

Use database transactions for balance and ledger updates.

## 8.8 Analytics Tables

```text
learning_events
game_analytics_events
assessment_analytics
daily_activity_summaries
weekly_progress_summaries
skill_mastery_snapshots
organization_analytics
```

Do not turn the main transactional database into an unrestricted analytics warehouse.

Use aggregation jobs and consider a dedicated analytical database when scale requires it.

---

# 9. LEARNING ENGINE

The Learning Engine is one of the most important domains.

## 9.1 Learning Hierarchy

```text
Subject
  |
Curriculum
  |
Grade / Level
  |
Learning Path
  |
Unit
  |
Lesson
  |
Learning Activity
  |
Assessment
  |
Mastery Evaluation
```

## 9.2 Learning Activity Types

- Video.
- Audio.
- Reading.
- Interactive text.
- Flashcards.
- Quiz.
- Mini-game.
- Drag and drop.
- Writing.
- Speaking.
- Project.
- Experiment.
- Revision.

## 9.3 Learning Progress

Track:

- Activities completed.
- Accuracy.
- Attempts.
- Time spent.
- Hints used.
- Skills practiced.
- Assessment history.
- Retention performance.
- Mastery level.

Do not equate completion with mastery.

## 9.4 Skill Mastery

Use a configurable mastery model.

Suggested initial levels:

```text
NOT_STARTED
INTRODUCED
PRACTICING
DEVELOPING
PROFICIENT
MASTERED
```

Mastery decisions should use multiple observations, not one correct answer.

Support spaced repetition and revision scheduling.

The learning engine must be able to recommend revision when a learner demonstrates weak retention.

---

# 10. ADAPTIVE LEARNING ENGINE

The system must personalize learning pathways.

## 10.1 Inputs

- Age range.
- Grade level.
- Curriculum.
- Current skill mastery.
- Previous assessment results.
- Incorrect answer patterns.
- Learning history.
- Revision history.
- Accessibility preferences.

## 10.2 Adaptive Decision Pipeline

```text
Collect Learning Evidence
          |
Analyze Skill Performance
          |
Identify Knowledge Gaps
          |
Evaluate Prerequisites
          |
Select Next Activity
          |
Adjust Difficulty
          |
Record Learning Outcome
          |
Recalculate Mastery
```

## 10.3 Difficulty Adaptation

Use configurable difficulty levels:

```text
LEVEL_1: FOUNDATION
LEVEL_2: BASIC
LEVEL_3: INTERMEDIATE
LEVEL_4: ADVANCED
LEVEL_5: CHALLENGE
```

Adapt difficulty based on evidence over multiple attempts.

Avoid immediately increasing difficulty after one successful response or lowering it after one mistake.

## 10.4 Recommendation Engine

The recommendation engine should support:

- Continue learning.
- Revise previous concepts.
- Practice weak skills.
- Unlock prerequisite content.
- Suggest a related challenge.
- Recommend age-appropriate enrichment.

Recommendations must be explainable.

Example:

```json
{
  "recommendation_type": "REVISION",
  "skill_id": "english.vocabulary.animals",
  "reason": "Low retention across recent attempts",
  "activity_type": "FLASHCARDS",
  "priority": "HIGH"
}
```

---

# 11. GAME ENGINE ARCHITECTURE

## 11.1 Game Engine Objectives

Build a reusable game execution framework.

Do not implement every mini-game as an independent application with duplicated scoring, session and reward logic.

The Game Engine must provide:

- Game registration.
- Game configuration.
- Version management.
- Content injection.
- Session lifecycle.
- Timer management.
- Attempt tracking.
- Scoring.
- Evaluation.
- Event reporting.
- Rewards.
- Offline support.
- Accessibility.
- Analytics.

## 11.2 Game Plugin Contract

Every game must implement a shared contract.

Example TypeScript:

```typescript
export interface GamePlugin {
  metadata: GameMetadata;

  initialize(
    context: GameContext
  ): Promise<void>;

  start(): Promise<void>;

  submitAction(
    action: GameAction
  ): Promise<GameActionResult>;

  pause(): Promise<void>;

  resume(): Promise<void>;

  finish(): Promise<GameResult>;

  dispose(): Promise<void>;
}
```

Game metadata:

```typescript
export interface GameMetadata {
  id: string;
  version: string;
  title: string;
  supportedPlatforms: Platform[];
  supportedSubjects: string[];
  supportedAgeRanges: AgeRange[];
  supportedLanguages: string[];
  accessibilityFeatures: string[];
}
```

The game runtime must never have unrestricted access to backend services.

Use a controlled SDK.

## 11.3 Game Session Lifecycle

```text
CREATED
   |
INITIALIZED
   |
IN_PROGRESS
   |
PAUSED
   |
IN_PROGRESS
   |
SUBMITTED
   |
VALIDATING
   |
COMPLETED
```

Additional terminal states:

```text
EXPIRED
CANCELLED
INVALIDATED
```

Session transitions must be validated server-side.

## 11.4 Game Scoring

Use server-authoritative scoring.

Client-side scoring is only provisional.

A game result should include:

```typescript
interface GameResult {
  sessionId: string;
  gameId: string;
  gameVersion: string;
  completed: boolean;
  correctAnswers: number;
  totalQuestions: number;
  attempts: number;
  durationSeconds: number;
  skillEvidence: SkillEvidence[];
  eventSequence: number;
}
```

The backend independently validates scoring rules.

Do not accept arbitrary XP or coins from clients.

## 11.5 Offline Game Support

Support selected games offline.

Requirements:

- Downloadable game content.
- Versioned content packages.
- Local SQLite persistence.
- Local event queue.
- Event sequence numbers.
- Idempotent synchronization.
- Conflict handling.
- Session expiration.
- Server validation after reconnection.

Offline gameplay must not permit unauthorized rewards.

## 11.6 Mini-Game Catalog

Implement a comprehensive game library.

### Language Games

1. Word Match.
2. Picture Vocabulary.
3. Sentence Builder.
4. Grammar Quest.
5. Spelling Challenge.
6. Listening Detective.
7. Reading Adventure.
8. Word Memory.
9. Story Builder.
10. Pronunciation Practice.

### Mathematics Games

1. Number Rush.
2. Math Puzzle.
3. Multiplication Quest.
4. Geometry Explorer.
5. Fraction Builder.
6. Measurement Challenge.
7. Logic Lab.
8. Pattern Detective.
9. Math Adventure.
10. Problem Solver.

### Science Games

1. Science Lab.
2. Animal Explorer.
3. Human Body Quest.
4. Space Mission.
5. Plant Life Simulator.
6. Ecosystem Builder.
7. Weather Detective.
8. Physics Playground.

### Geography and History

1. World Explorer.
2. Map Puzzle.
3. Country Match.
4. Landmark Adventure.
5. Timeline Builder.
6. Ancient Civilization Quest.

### Coding and Logic

1. Robot Mission.
2. Algorithm Builder.
3. Sequence Puzzle.
4. Debugging Challenge.
5. Block Coding Adventure.
6. Logic Escape Room.

### Creativity

1. Art Studio.
2. Music Maker.
3. Story Creator.
4. Design Challenge.
5. Creative Puzzle.

Each game must have:

- Educational objective.
- Age suitability.
- Skill mapping.
- Difficulty configuration.
- Game rules.
- Scoring logic.
- Feedback.
- Accessibility support.
- Analytics events.
- Test cases.

---

# 12. VIRTUAL WORLD ENGINE

## 12.1 World Structure

Create a persistent educational universe.

```text
IMPULSE WORLD
  |
  +-- Language Kingdom
  |
  +-- Math Mountain
  |
  +-- Science Planet
  |
  +-- Discovery Land
  |
  +-- Creative City
  |
  +-- Tech Galaxy
```

Each world contains:

- Regions.
- Locations.
- Missions.
- Learning activities.
- Mini-games.
- Collectibles.
- Characters.
- Unlockable content.

## 12.2 Exploration Mechanics

Children should be able to:

- Explore unlocked regions.
- Interact with characters.
- Discover learning activities.
- Collect educational artifacts.
- Complete missions.
- Unlock new environments.
- Build a personal collection.

World exploration must remain available through accessible 2D interfaces when 3D rendering is unavailable.

## 12.3 World Progression

World unlocks should depend on educational progress.

Avoid purely time-based progression.

Use prerequisite skills and learning milestones.

---

# 13. GAMIFICATION ECONOMY

## 13.1 XP

XP represents learning activity and achievement.

Use configurable rules.

Example:

```text
Lesson completion: configurable XP
Successful challenge: configurable XP
Skill mastery: configurable XP
Revision completion: configurable XP
Creative project: teacher-reviewed XP
```

Do not reward repeated meaningless actions.

## 13.2 Coins

Coins are virtual rewards.

They can be used for:

- Avatar accessories.
- Clothing.
- Decorative items.
- Room customization.
- World decorations.
- Collectibles.

Coins must not be convertible to real money.

Avoid gambling-like mechanics, randomized paid rewards or loot boxes.

## 13.3 Achievements

Examples:

- First Discovery.
- Vocabulary Explorer.
- Math Master.
- Science Detective.
- Reading Champion.
- Creative Thinker.
- Consistent Learner.

Achievement rules must be configurable.

## 13.4 Leaderboards

Support:

- Personal milestones.
- Classroom leaderboards.
- Team challenges.
- Optional school competitions.

Protect child identity.

Use pseudonyms and restricted visibility.

Do not publicly expose child profiles.

Never make public competition a prerequisite for learning rewards.

---

# 14. QUEST ENGINE

Implement:

- Daily quests.
- Weekly quests.
- Subject quests.
- Story quests.
- Teacher-assigned quests.
- Seasonal educational events.
- Collaborative missions.

Quest definition:

```typescript
interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  objectives: QuestObjective[];
  prerequisites: string[];
  rewards: QuestReward[];
  ageRange: AgeRange;
  availability: AvailabilityRule;
}
```

Quest completion must be verified using actual learning events.

Support repeatable and non-repeatable quests.

Quest assignments must be versioned.

---

# 15. AI LEARNING SERVICES

AI must be an optional intelligence layer, not the source of truth for educational results.

## 15.1 AI Capabilities

Implement separate services for:

- AI tutor.
- Reading assistant.
- Vocabulary explanation.
- Age-appropriate explanations.
- Story generation.
- Practice question generation.
- Learning recommendations.
- Teacher content assistance.
- Translation assistance.
- Speaking feedback.

## 15.2 AI Tutor

The AI tutor must:

- Explain concepts simply.
- Ask guiding questions.
- Give hints before full explanations.
- Adapt language complexity.
- Respect the learner's age.
- Avoid collecting unnecessary personal information.
- Operate within approved educational content boundaries.

## 15.3 AI Content Generation

AI-generated content must enter a review workflow.

```text
CONTENT REQUEST
      |
AI GENERATION
      |
SCHEMA VALIDATION
      |
PEDAGOGICAL VALIDATION
      |
HUMAN REVIEW
      |
APPROVAL
      |
PUBLICATION
```

Never automatically publish unreviewed AI-generated child-facing educational content.

## 15.4 AI Architecture

Use provider adapters.

```typescript
interface AIProvider {
  generateText(
    input: GenerateTextInput
  ): Promise<GenerateTextResult>;

  generateStructuredOutput<T>(
    input: StructuredInput<T>
  ): Promise<T>;
}
```

Support provider replacement.

Implement:

- Timeouts.
- Rate limits.
- Usage quotas.
- Cost tracking.
- Moderation.
- Retry policies.
- Audit logs.
- Provider fallback where appropriate.

Do not send unnecessary child profile data to external AI services.

---

# 16. PARENT PORTAL

Parent Portal must provide:

## Dashboard

- Children list.
- Learning progress.
- Subject performance.
- Weekly activity.
- Completed lessons.
- Learning recommendations.
- Account settings.

## Child Management

- Add or authorize a child.
- Manage account access.
- Set age-appropriate preferences.
- Configure allowed learning features.
- Manage consent.
- Review connected devices.

## Reports

- Daily progress.
- Weekly reports.
- Monthly reports.
- Subject-level progress.
- Skill mastery.
- Learning gaps.

## Safety

- Privacy controls.
- Screen-time guidance.
- Notification settings.
- Purchase authorization.
- Account deletion requests.

Parents must not be able to modify assessment results or fabricate learning progress.

---

# 17. TEACHER PORTAL

Features:

- Classroom management.
- Student enrollment.
- Learning path assignment.
- Homework assignment.
- Individual progress.
- Group progress.
- Assessment creation.
- Assessment review.
- Learning gap detection.
- Teacher notes.
- Reports.
- Student intervention recommendations.

Teachers must only access students within their authorized institutional relationships.

Provide class-level and individual-level analytics.

---

# 18. SCHOOL MANAGEMENT

Support:

- Organizations.
- Branches.
- Departments.
- Academic years.
- Terms.
- Grades.
- Classrooms.
- Teachers.
- Students.
- Enrollments.
- Class schedules.
- Institutional reports.
- Subscription management.

Support branded school environments.

A school should be able to use its own logo, colors and domain where the subscription allows it.

---

# 19. CONTENT MANAGEMENT SYSTEM

The CMS must be powerful enough to manage the entire educational ecosystem.

## 19.1 Content Studio

Create and manage:

- Subjects.
- Curriculums.
- Units.
- Lessons.
- Questions.
- Assessments.
- Games.
- Quests.
- Worlds.
- Characters.
- Audio.
- Images.
- Video.
- Learning paths.

## 19.2 Visual Game Builder

Provide a configuration-based game authoring system.

Authorized content creators should be able to configure supported game templates without writing code.

Example configuration:

```json
{
  "template": "matching",
  "version": 1,
  "title": "Animal Vocabulary",
  "ageRange": [7, 8],
  "difficulty": 2,
  "language": "en",
  "instructions": {
    "text": "Match the animal with its name",
    "audio": "instructions.mp3"
  },
  "content": {
    "items": []
  },
  "scoring": {
    "correctAnswer": 10,
    "incorrectAnswer": 0
  }
}
```

Validate configurations against strict schemas.

Do not execute arbitrary JavaScript from CMS content.

## 19.3 Media Management

Support:

- Upload.
- Metadata.
- Image optimization.
- Audio processing.
- Video processing.
- Asset versioning.
- Content ownership.
- Access policies.
- CDN delivery.

---

# 20. NOTIFICATION SYSTEM

Support:

- In-app notifications.
- Push notifications.
- Email notifications for adults.
- SMS notifications where authorized.

Examples:

- New assignment.
- Weekly learning summary.
- Achievement unlocked.
- Parent report available.
- Subscription status.

Notifications must be configurable and age-appropriate.

Avoid unnecessary promotional notifications to children.

Use BullMQ for asynchronous delivery.

Implement retry, delivery status and provider failure tracking.

---

# 21. BILLING AND SUBSCRIPTIONS

Support multiple products and billing models.

## Individual Plans

- Free.
- Premium.
- Family.

## Institutional Plans

- School.
- Learning Center.
- Enterprise.

## Subscription Capabilities

- Plan definitions.
- Feature entitlements.
- Usage quotas.
- Subscription periods.
- Renewals.
- Cancellation.
- Grace periods.
- Payment records.
- Invoices.
- Refund records.
- Provider integrations.

Use provider adapters for payment systems.

Do not store raw payment card information.

All payment operations must be verified using authenticated provider webhooks.

Implement webhook signature validation and idempotency.

---

# 22. API DESIGN

Use REST APIs with versioning.

Base URL:

```text
/api/v1
```

## API Modules

```text
/api/v1/auth
/api/v1/users
/api/v1/children
/api/v1/parents
/api/v1/teachers
/api/v1/organizations
/api/v1/classrooms
/api/v1/subjects
/api/v1/worlds
/api/v1/learning-paths
/api/v1/lessons
/api/v1/content
/api/v1/games
/api/v1/game-sessions
/api/v1/assessments
/api/v1/progress
/api/v1/quests
/api/v1/achievements
/api/v1/rewards
/api/v1/inventory
/api/v1/avatars
/api/v1/leaderboards
/api/v1/ai
/api/v1/analytics
/api/v1/reports
/api/v1/notifications
/api/v1/subscriptions
/api/v1/admin
```

## 22.1 API Standards

Every endpoint must define:

- Authentication requirement.
- Authorization requirement.
- Request schema.
- Response schema.
- Validation.
- Error responses.
- Rate limits.
- Audit requirements.
- Pagination where applicable.

Use a consistent response format.

Example:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Use standard HTTP status codes.

Document endpoints with OpenAPI.

Generate typed clients from the API specification or shared contracts.

## 22.2 Idempotency

Require idempotency for operations such as:

- Game result submission.
- Reward transactions.
- Payment operations.
- Assignment submissions.
- Offline synchronization.

Never assume network requests arrive only once.

---

# 23. REAL-TIME ARCHITECTURE

Use Socket.IO where real-time behavior adds value.

Features:

- Classroom challenges.
- Teacher-controlled live activities.
- Team competitions.
- Session synchronization.
- Live progress updates.
- Multiplayer mini-games.

Implement:

- Authenticated connections.
- Tenant-aware rooms.
- Resource authorization.
- Rate limits.
- Reconnection.
- Event acknowledgements.
- Duplicate event protection.

Do not broadcast private child information to classroom-wide rooms.

Multiplayer must use controlled server-authoritative state transitions.

---

# 24. SECURITY ARCHITECTURE

Security is a first-class requirement.

## 24.1 Application Security

Implement:

- Input validation.
- Output encoding.
- SQL injection protection.
- XSS protection.
- CSRF protection.
- Secure CORS policies.
- SSRF protection.
- File upload validation.
- MIME validation.
- Request size limits.
- Rate limiting.
- Secure headers.
- Dependency scanning.
- Secret management.

## 24.2 Child Safety and Privacy

The product is designed for children aged 5–12.

Implement privacy by design.

Requirements:

- Collect only necessary data.
- Provide guardian-controlled accounts.
- Obtain applicable parental consent.
- Provide age-appropriate experiences.
- Do not expose public child profiles.
- Disable unsolicited direct messaging.
- Avoid targeted advertising.
- Do not sell children's personal data.
- Provide data export and deletion workflows.
- Maintain access and consent audit logs.
- Establish retention policies.
- Restrict analytics data access.

Review applicable legal requirements, including COPPA where applicable, GDPR and children's data requirements where applicable, and Uzbekistan's applicable personal data and child protection laws.

Do not assume that one jurisdiction's compliance automatically satisfies another.

## 24.3 Administrative Security

Privileged operations require:

- Strong authentication.
- MFA.
- Explicit authorization.
- Audit logging.
- Session controls.
- Sensitive action confirmation.

---

# 25. ANALYTICS AND REPORTING

Build two separate analytics perspectives.

## Learning Analytics

- Skill mastery.
- Assessment performance.
- Learning gaps.
- Content effectiveness.
- Revision effectiveness.
- Learning pathway completion.

## Product Analytics

- Active users.
- Feature adoption.
- Game completion.
- Retention.
- Subscription conversion.
- Platform performance.
- Error rates.

Use event-driven analytics.

Example event:

```typescript
interface LearningEvent {
  id: string;
  tenantId?: string;
  learnerId: string;
  eventType: string;
  subjectId?: string;
  skillId?: string;
  resourceId?: string;
  occurredAt: string;
  eventVersion: number;
  metadata: Record<string, unknown>;
}
```

Avoid collecting sensitive information in analytics payloads.

Provide dashboards with role-based access.

---

# 26. OFFLINE-FIRST MOBILE ARCHITECTURE

Mobile applications must work reliably on unstable internet connections.

Support:

- Cached learning content.
- Downloaded media.
- Offline games.
- Local progress queue.
- Local database.
- Background synchronization.
- Conflict resolution.
- Retry policies.

Synchronization flow:

```text
USER ACTION
    |
LOCAL DATABASE
    |
PENDING EVENT QUEUE
    |
NETWORK AVAILABLE?
    |
    +-- NO --> WAIT
    |
    +-- YES --> SYNC API
                    |
                VALIDATION
                    |
                IDEMPOTENCY
                    |
                DATABASE COMMIT
                    |
                SYNC ACKNOWLEDGEMENT
```

Do not overwrite newer server state with stale local state.

Define conflict resolution by data type.

---

# 27. FRONTEND DESIGN SYSTEM

## 27.1 Visual Identity

Product: IMPULSE WORLD.

Visual direction:

- Colorful.
- Friendly.
- Modern.
- Playful.
- High-quality 3D illustrations.
- Rounded UI.
- Clear visual hierarchy.
- Accessible contrast.
- Responsive layouts.

The visual language should be suitable for children without looking like a generic preschool application.

## 27.2 Design Tokens

Define centralized tokens:

```text
colors/
  primary
  secondary
  success
  warning
  danger
  background
  surface
  text
  border

spacing/
typography/
radii/
shadows/
breakpoints/
motion/
```

Create reusable components:

- Buttons.
- Cards.
- Navigation.
- Progress bars.
- XP counters.
- Coin counters.
- Avatar components.
- Game containers.
- Quest cards.
- Achievement cards.
- Subject cards.
- Learning progress components.
- Modal systems.
- Toast notifications.

## 27.3 Accessibility

Support:

- Keyboard navigation.
- Screen readers.
- Large touch targets.
- Text scaling.
- Reduced motion.
- Color contrast.
- Audio alternatives.
- Instructions in text and audio.
- Non-drag alternatives for drag-and-drop activities.

---

# 28. INTERNATIONALIZATION

Support:

- Uzbek.
- English.
- Russian.

Build the localization system from the beginning.

Requirements:

- Translation namespaces.
- Locale-aware formatting.
- Content translations.
- Language-specific audio.
- RTL-ready architecture for future languages.
- Fallback language.
- Translation review workflow.

Never hardcode interface text throughout the applications.

Educational content translations must be independently reviewable.

---

# 29. PERFORMANCE AND SCALABILITY

Design for growth from individual learners to multiple institutions.

Initial architectural planning assumptions:

- 100,000 registered accounts.
- 10,000 daily active learners.
- 2,000 concurrent active sessions.
- High-volume game events.
- Large media libraries.

These are capacity targets, not guaranteed performance claims.

## 29.1 Optimization

Implement:

- Database indexes.
- Query optimization.
- Redis caching.
- CDN media delivery.
- Pagination.
- Background processing.
- Connection pooling.
- Asset compression.
- Lazy loading.
- Mobile image optimization.
- Game asset preloading.
- Analytics aggregation.

## 29.2 Scaling Strategy

Scale components independently when needed:

1. API replicas.
2. Background workers.
3. Real-time gateway.
4. Media processing.
5. Analytics processing.
6. AI provider workers.

Keep transactional business logic consistent.

Do not introduce distributed transactions unnecessarily.

---

# 30. DEVOPS AND DEPLOYMENT

## 30.1 Environments

Maintain:

```text
local
development
staging
production
```

Never use production data in development without approved anonymization.

## 30.2 Docker Services

```text
api
web
admin
parent-portal
teacher-portal
postgres
redis
minio
worker
scheduler
nginx
```

Applications may be deployed independently.

## 30.3 Production Infrastructure

Recommended initial deployment:

- Linux VPS or cloud infrastructure.
- Coolify.
- Docker containers.
- Managed or separately maintained PostgreSQL.
- Redis.
- S3-compatible storage.
- CDN.
- Reverse proxy.
- Automated SSL.
- Monitoring.
- Backup storage.

Use private network connections for database and Redis.

Never expose internal database ports publicly.

## 30.4 CI/CD

GitHub Actions pipeline:

```text
PULL REQUEST
    |
LINT
    |
TYPE CHECK
    |
UNIT TESTS
    |
INTEGRATION TESTS
    |
BUILD
    |
SECURITY SCAN
    |
APPROVAL
    |
STAGING DEPLOYMENT
    |
SMOKE TESTS
    |
PRODUCTION RELEASE
```

Production database migrations must be backward-compatible.

Use expand-and-contract migration strategies.

## 30.5 Backup Strategy

Implement:

- Automated PostgreSQL backups.
- Point-in-time recovery where supported.
- Object-storage versioning.
- Encrypted backups.
- Separate backup credentials.
- Retention policies.
- Restore testing.

A backup is not considered verified until restoration has been tested.

---

# 31. OBSERVABILITY

Implement:

- Structured logs.
- Correlation IDs.
- Distributed tracing.
- Error monitoring.
- API latency metrics.
- Database metrics.
- Queue metrics.
- WebSocket metrics.
- Mobile crash reporting.
- Game performance metrics.

Define alerts for:

- API failures.
- Database availability.
- Queue backlog.
- Failed jobs.
- Authentication anomalies.
- Storage failures.
- Payment webhook failures.
- Excessive latency.

Never put child personal data, passwords, tokens or sensitive payloads into logs.

---

# 32. TESTING STRATEGY

Testing must be part of every feature.

## Unit Tests

Test:

- Domain logic.
- Scoring.
- Mastery calculations.
- Rewards.
- Quest conditions.
- Permission rules.
- Adaptive learning decisions.

## Integration Tests

Test:

- Database repositories.
- Authentication.
- Tenant isolation.
- Reward transactions.
- Game result validation.
- Payment webhooks.
- Background jobs.

## End-to-End Tests

Test complete user journeys.

### Child Journey

```text
Register / Join
    |
Choose Avatar
    |
Open Learning World
    |
Complete Lesson
    |
Play Mini-game
    |
Receive Result
    |
Update Learning Progress
    |
Unlock Achievement
```

### Parent Journey

```text
Create Parent Account
    |
Authorize Child
    |
Review Consent
    |
Open Dashboard
    |
Review Learning Progress
    |
Configure Child Settings
```

### Teacher Journey

```text
Login
    |
Create Classroom
    |
Enroll Students
    |
Assign Learning Path
    |
Review Progress
    |
Create Assessment
```

### School Journey

```text
Create Organization
    |
Configure Branches
    |
Invite Teachers
    |
Enroll Students
    |
Create Classrooms
    |
Review Reports
```

## Testing Tools

Use:

- Vitest or Jest.
- Supertest.
- Playwright.
- React Native testing tools.
- Maestro for mobile end-to-end testing.
- Testcontainers where practical.

Set coverage thresholds for critical business domains.

Do not use code coverage percentage as a substitute for meaningful assertions.

---

# 33. API AND EVENT CONTRACTS

All inter-module communication must use explicit contracts.

Example domain events:

```text
user.created
child.authorized
learner.enrolled
lesson.started
lesson.completed
assessment.submitted
assessment.evaluated
skill.mastery.updated
game.session.started
game.session.completed
quest.completed
achievement.unlocked
reward.credited
subscription.activated
payment.confirmed
```

Use a transactional outbox pattern for events that must not be lost after database commits.

Events must include:

- Event ID.
- Event type.
- Event version.
- Aggregate ID.
- Tenant ID where applicable.
- Timestamp.
- Correlation ID.
- Validated payload.

Consumers must be idempotent.

Use explicit event schemas and schema compatibility checks.

---

# 34. BUSINESS RULES

Centralize business rules in domain services.

Examples:

- A child cannot access another child's private records.
- A teacher cannot access an unrelated classroom.
- A learner cannot receive duplicate rewards for one completed session.
- A quest cannot be completed without its required objectives.
- An achievement must satisfy its defined conditions.
- A game result must reference a valid game version.
- An assessment must use the correct published version.
- A tenant cannot access another tenant's data.
- A payment cannot activate an entitlement without verification.
- A child cannot perform privileged account-management actions.

All critical business rules must be tested.

---

# 35. FEATURE FLAGS AND CONFIGURATION

Support feature flags for:

- New game types.
- New learning algorithms.
- New payment providers.
- AI features.
- Multiplayer.
- Experimental content.
- New UI experiences.

Feature flags must support tenant-level and environment-level configuration.

Do not use feature flags as a replacement for authorization.

---

# 36. DOCUMENTATION REQUIREMENTS

Maintain the following documentation:

```text
docs/
  architecture/
    system-overview.md
    domain-boundaries.md
    data-flow.md
    tenancy.md

  database/
    schema-overview.md
    entity-relationships.md
    migrations.md

  api/
    authentication.md
    authorization.md
    api-conventions.md
    openapi.md

  game-engine/
    architecture.md
    plugin-contract.md
    scoring.md
    offline-sync.md

  learning/
    learning-engine.md
    adaptive-learning.md
    mastery-model.md

  security/
    threat-model.md
    privacy.md
    access-control.md

  deployment/
    local-development.md
    staging.md
    production.md
    backup-restore.md

  decisions/
    ADR-001-modular-monolith.md
    ADR-002-multitenancy.md
    ADR-003-game-runtime.md
```

Every major architecture decision must have an ADR.

---

# 37. CLAUDE CODE ENGINEERING INSTRUCTIONS

This section is mandatory.

Claude Code must behave as a senior software architect, technical lead and implementation engineer.

## 37.1 Primary Objective

Build a complete, maintainable, secure and production-ready IMPULSE WORLD platform according to this specification.

Do not interpret this document as a request to create a simple MVP, static prototype or landing page.

Implement real business logic, database persistence, authorization, integrations, tests and operational tooling.

## 37.2 Before Writing Code

First:

1. Inspect the entire repository.
2. Identify existing code and reusable modules.
3. Identify installed dependencies.
4. Inspect configuration and environment variables.
5. Identify existing architectural decisions.
6. Identify missing capabilities.
7. Produce a detailed implementation plan.
8. Create or update project documentation.
9. Identify security and data migration risks.

Do not delete existing working code without a clear reason.

Do not overwrite existing environment configuration.

If this is an existing repository, preserve its established conventions where compatible.

## 37.3 Implementation Rules

- TypeScript strict mode.
- No arbitrary `any`.
- No placeholder business logic.
- No fake API responses in production features.
- No hardcoded secrets.
- No hardcoded tenant IDs.
- No insecure authorization shortcuts.
- No client-authoritative rewards.
- No arbitrary code execution from content configurations.
- No unvalidated user input.
- No untested critical business logic.
- No unnecessary dependencies.
- No premature microservices.

Use maintainable code and explicit interfaces.

## 37.4 Implementation Workflow

Work domain by domain.

For every domain:

1. Define domain responsibilities.
2. Define database models.
3. Define validation contracts.
4. Implement domain services.
5. Implement persistence.
6. Implement application use cases.
7. Implement API endpoints.
8. Implement authorization.
9. Implement frontend integration.
10. Write unit tests.
11. Write integration tests.
12. Write E2E tests where applicable.
13. Update documentation.

Do not mark a domain complete merely because its UI exists.

## 37.5 Definition of Done

A feature is complete only when:

- Database migrations exist.
- Business rules are implemented.
- API contracts are defined.
- Authorization is implemented.
- Frontend integration works.
- Error handling is implemented.
- Tests pass.
- Documentation is updated.
- No known critical security issues remain.

## 37.6 Claude Code Project Files

Maintain:

```text
CLAUDE.md
ARCHITECTURE.md
IMPLEMENTATION_PLAN.md
DEVELOPMENT_STATUS.md
DECISIONS.md
SECURITY.md
README.md
```

### CLAUDE.md

This file must contain:

- Project overview.
- Technology stack.
- Repository conventions.
- Coding standards.
- Module boundaries.
- Security requirements.
- Testing commands.
- Database migration instructions.
- Deployment instructions.
- Important architectural constraints.

### IMPLEMENTATION_PLAN.md

Maintain an executable engineering roadmap with:

- Domains.
- Dependencies.
- Tasks.
- Acceptance criteria.
- Test requirements.
- Blockers.

### DEVELOPMENT_STATUS.md

Update after every implementation session.

Record:

- Completed tasks.
- In-progress tasks.
- Tests executed.
- Known issues.
- Architecture changes.
- Next recommended tasks.

Do not claim that functionality is implemented unless it exists and has been verified.

---

# 38. IMPLEMENTATION SEQUENCE

The complete platform should be implemented in controlled engineering stages.

These stages are not separate MVP releases. They are dependencies in the full system implementation.

## Stage 1 — Engineering Foundation

- Monorepo.
- Shared tooling.
- CI/CD.
- Environment configuration.
- Database.
- Redis.
- Storage.
- Observability.
- Architecture documentation.

## Stage 2 — Identity and Organization

- Authentication.
- Authorization.
- User management.
- Child profiles.
- Parent relationships.
- Tenancy.
- Organizations.
- Branches.
- Memberships.

## Stage 3 — Education Core

- Subjects.
- Curriculums.
- Learning objectives.
- Skills.
- Learning paths.
- Lessons.
- Content versioning.
- Question banks.
- Assessments.
- Progress tracking.

## Stage 4 — Game Platform

- Game SDK.
- Game registry.
- Game runtime.
- Game templates.
- Game sessions.
- Scoring.
- Game analytics.
- Offline support.
- Mini-game library.

## Stage 5 — Virtual World

- World maps.
- Regions.
- Locations.
- Characters.
- Avatar system.
- Exploration.
- Unlock conditions.
- Collectibles.

## Stage 6 — Gamification

- XP.
- Coins.
- Wallet.
- Rewards.
- Achievements.
- Quests.
- Inventory.
- Leaderboards.
- Team challenges.

## Stage 7 — Adaptive Learning and AI

- Mastery model.
- Adaptive recommendations.
- Spaced repetition.
- AI tutor.
- Content generation.
- AI moderation.
- Provider adapters.

## Stage 8 — Parent and Teacher Ecosystem

- Parent portal.
- Teacher portal.
- Classroom management.
- Assignments.
- Assessment review.
- Reports.
- Notifications.

## Stage 9 — School and Business Management

- School administration.
- Branch management.
- Institutional analytics.
- Subscription management.
- Billing.
- Entitlements.
- Tenant branding.

## Stage 10 — Platform Administration

- Global CMS.
- Content approval.
- Game builder.
- User administration.
- Tenant administration.
- Audit management.
- Support tools.

## Stage 11 — Production Hardening

- Performance testing.
- Security testing.
- Load testing.
- Backup restoration.
- Disaster recovery.
- Accessibility testing.
- Mobile testing.
- Production deployment.

---

# 39. PRODUCTION ACCEPTANCE CRITERIA

The platform must not be declared production-ready until the following criteria are verified.

### Architecture

- All core domains have defined boundaries.
- No unintended circular dependencies.
- Multi-tenancy is enforced.
- Database migrations are reproducible.
- APIs are documented.

### Security

- Authorization is tested.
- Tenant isolation is tested.
- Child privacy controls are implemented.
- Refresh token rotation works.
- Privileged actions are audited.
- File access is authorized.
- Secrets are not exposed.

### Education

- Learning paths work.
- Lessons are versioned.
- Assessments are validated.
- Progress is persisted.
- Skill mastery is measurable.
- Adaptive recommendations are explainable.

### Games

- Game templates are versioned.
- Game sessions work.
- Scoring is server-validated.
- Rewards are idempotent.
- Offline synchronization is tested.
- Game analytics are recorded.

### Applications

- Web works.
- Android works.
- iOS works.
- Parent Portal works.
- Teacher Portal works.
- Admin CMS works.

### Operations

- CI/CD works.
- Monitoring works.
- Backups are verified.
- Restore procedure is documented.
- Deployment is reproducible.
- Critical alerts are configured.

### Quality

- Critical user journeys pass E2E tests.
- Critical business logic has meaningful tests.
- No unresolved critical vulnerabilities.
- Accessibility requirements are verified.
- Performance targets are measured against realistic workloads.

---

# 40. FINAL ENGINEERING DIRECTIVE

IMPULSE WORLD must become a complete educational ecosystem, not a collection of disconnected features.

The core product experience is:

```text
DISCOVER
   |
EXPLORE
   |
LEARN
   |
PLAY
   |
PRACTICE
   |
DEMONSTRATE MASTERY
   |
UNLOCK NEW EXPERIENCES
   |
CONTINUE LEARNING
```

The technical foundation must support long-term product growth.

Prioritize:

1. Educational correctness.
2. Child safety.
3. Data integrity.
4. Reliable game execution.
5. Excellent user experience.
6. Maintainable architecture.
7. Operational reliability.
8. Scalability.

**FINAL INSTRUCTION TO CLAUDE CODE:**

Treat this document as the master architectural specification.

Do not attempt to implement the entire platform in one uncontrolled code-generation operation.

First inspect the repository and create a complete engineering plan. Then implement the complete system incrementally, preserving architecture, testing every critical domain and documenting every significant decision.

Do not replace real functionality with mock data.

Do not leave critical features as TODO comments.

Do not claim production readiness without passing the defined verification criteria.

The final result must be a fully integrated, secure, maintainable and extensible educational technology platform capable of serving individual families, learning centers and schools across Web, Android and iOS.

**PROJECT: IMPULSE WORLD — Learn. Play. Explore.**