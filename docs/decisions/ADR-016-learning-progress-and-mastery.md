# ADR-016: Learning Progress, Skill Mastery and Event Consumers

**Status:** Accepted, 2026-11-03

## Context

Stage 3 needs progress to be persisted and skill mastery to be measurable. The spec says not to equate completion with mastery (9.3), and to base mastery on multiple observations with a configurable model (9.4). The acceptance criteria repeat that mastery uses multiple observations. ADR-015 left `assessment.submitted` with no consumer.

There was a second, hidden problem. The worker loaded only the platform modules, and `EVENT_CONSUMERS` could not collect consumers from domain modules. No domain module could have registered a consumer that actually ran.

## Decision

**Consumers are discovered, and the worker loads them.** A domain provider marked `@ConsumesEvents()` is found by `EventDispatcher` when the application starts, through Nest's `DiscoveryService`. Two consumers with the same name stop startup, because names key the idempotency records. `CONSUMER_MODULES` in `app.module.ts` lists the modules with consumers, and `CORE_MODULES` lists the global domain modules that others depend on. `WorkerModule`, in its own file, loads both on top of the platform modules. An integration test builds `WorkerModule` and checks the consumer is registered, because the API's tests cannot see a dependency the worker is missing.

**A `learning-progress` module owns three tenant tables.**

- `lesson_completions`: one row per learner and lesson version finished. Completion is taken on the learner's word, because it is not a score. Repeating it records nothing new, and the first one writes `lesson.completed`.
- `skill_observations`: one row per scored item and skill. These are append-only evidence: a trigger refuses updates and deletes, for the system role too.
- `skill_mastery`: one row per learner and skill. It is a derived summary that can always be recomputed from the observations.

**Evidence comes only from server-marked items.** The consumer of `assessment.submitted` reads the submitted attempt from the database, not from the event. Each item marked `CORRECT`, `PARTIAL` or `INCORRECT` becomes an observation for every skill on its question. Unanswered items, and items waiting for a person to mark them, are not evidence yet. Observations are unique per response and skill, and the dispatcher's claim makes the consumer run once per event.

**The mastery model is a pure function with configurable thresholds** (`modules/learning-progress/domain/mastery.ts`).

- With no observations a skill is `NOT_STARTED`, and with fewer than 3 it is `INTRODUCED`, however well they went.
- Above that, accuracy is the mean of the 10 most recent observations: below 0.5 is `PRACTICING`, below 0.7 is `DEVELOPING`, and from 0.7 is `PROFICIENT`.
- `MASTERED` needs accuracy of at least 0.85, at least 6 observations in total, and observations from at least 2 separate attempts. One long test therefore cannot master a skill.
- Only recent work counts, so mastery falls back when recent work is weak. That fall is the signal for revision.

**Who sees progress.** A learner reads their own at `GET /learn/progress`. `GET /children/:id/progress` uses `childAccessPolicy.canView` through `ChildService`, so guardians and staff with `children.view_all` can see it. Anyone else gets not found.

**Paths show progress.** A learner's view of a path marks each lesson `completed`, and `locked` while an earlier live lesson in the path is unfinished. Locking is guidance for the learner's screen. Lessons themselves are not refused, because a lesson can sit in several paths.

## Consequences

- Revision is not scheduled yet. Spaced repetition needs observation history, which this provides, plus a scheduler.
- The thresholds are code constants. Per-tenant or per-subject models can be passed to the same function later.
- Time spent and hints used (spec 9.3) are not recorded yet. They arrive with game sessions in Stage 4.
- If an item a person has to mark is marked later, its evidence will need a new event that this consumer also handles.
