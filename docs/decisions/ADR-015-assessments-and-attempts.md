# ADR-015: Assessments, Attempts and Server-Side Scoring

**Status:** Accepted, 2026-11-02

## Context

Stage 3 requires assessment attempts and evaluation. Its acceptance criteria say historical results keep their version, and CLAUDE.md says client code never decides scores. ADR-013 already provides the lifecycle, version pinning as a rule, and one evaluator per question type.

## Decision

**An assessment is versioned teaching material.** `assessments` and `assessment_versions` follow lessons exactly: global plus tenant, the shared lifecycle, a frozen-content trigger, and one published and one in-progress version per assessment. A version holds the title, instructions, a pass mark from 0 to 1, an optional attempt limit, and items. Each item names an exact question version and is worth 1 to 10 points. An assessment can be submitted, approved or published only when every question in it is published.

**Attempts pin everything they use.** `assessment_attempts` stores the assessment version the attempt started on. `assessment_responses` stores each answer with its question version. If a new version is published while an attempt is open, that attempt carries on, and is marked, against the version it started on. Both tables are tenant-only with forced RLS.

**The server marks, once, at submission.** Saving an answer stores it and returns no hint of correctness. Submitting evaluates every item against its pinned question version with the ADR-013 evaluators, totals it with a pure function (`modules/assessments/domain/scoring.ts`), and commits the scores, the closed attempt and an `assessment.submitted` event together.

- The score is the share of all points earned. An unanswered item scores zero and is recorded as `UNANSWERED`.
- An item that needs a person to mark it (audio, or open text matching no accepted answer) counts as zero for now. `passed` stays null while any such item is pending, because marking it could change the outcome.
- Submitting again returns the stored result and writes no second event, so a retried request is safe.

**The database keeps results honest.**

- A submitted attempt can never change, and its responses can no longer be written. Triggers enforce this for the request role and the system role alike.
- An attempt's version must belong to its assessment.
- A partial unique index allows one open attempt per learner and assessment, so a double tap resumes the same attempt.
- Saving and submitting lock the attempt row, so they never interleave.
- Neither role may delete attempts or responses.

**Learners reach only their own attempts.** RLS keeps schools apart. The service adds the learner check, and another learner's attempt reads as not found. RLS does not do this per learner, because teachers will read their classes' attempts in Stage 8.

**Attempt limits** count submitted attempts on any version of the assessment, against the limit in the live version.

## Consequences

- No one can mark `NEEDS_REVIEW` items yet. Teacher marking arrives with Stage 8, and will need a reviewed path to update a submitted attempt, which the trigger currently refuses.
- There is no time limit or per-item feedback yet. Results show each item's outcome, never the answer key.
- `assessment.submitted` has no consumer yet. Progress and mastery, the next slice, will consume it.
