# ADR-014: Learning Paths and Units

**Status:** Accepted, 2026-11-02

## Context

The learning hierarchy in spec 9.1 runs subject, curriculum, grade, learning path, unit, lesson. Spec 8.3 lists `learning_paths`, `learning_path_versions`, `learning_path_nodes` and `units` as tables. ADR-013 already settles the lifecycle, global plus tenant scope and localized JSONB text for teaching material. What is left is how units are stored and how a path refers to its lessons.

## Decision

**A path is versioned teaching material.** `learning_paths` holds the identity (subject, optional grade level, owner). `learning_path_versions` holds the title, summary and units as JSONB, validated by `learningPathContentSchema`. Versions go through the shared lifecycle with the same rules, partial unique indexes and database trigger as lessons and questions. The author can never approve or publish their own version, and a version's content is frozen once it leaves `DRAFT`.

**Units live inside the path version, not in their own tables.** A unit has an id chosen by the author, a localized title, an optional summary and an ordered list of lessons. Units only exist as part of a path, and their order and contents are what reviewers approve. Storing them on the version row freezes the whole structure in one place, as ADR-013 did for lesson blocks. This replaces the spec's `units` and `learning_path_nodes` tables. A lesson can appear only once in a path.

**A path names lessons by id, not by version.** A lesson pins exact question versions, because answer keys decide scores. A path only decides order, so it delivers whatever version of each lesson is live now. A corrected lesson reaches every path that uses it without the path going through review again. Results stay pinned anyway: progress and attempts will store the lesson version and question versions the learner actually used (ADR-013).

- A path can be submitted, approved or published only when every lesson in it has a published version. Otherwise the step is refused with `LESSON_NOT_PUBLISHED` and the lesson ids.
- If a lesson in a live path is later archived, learners no longer see it, and a unit left with no lessons is hidden. The path itself stays live.
- A tenant path may use the tenant's own lessons and global lessons. RLS hides other tenants' lessons, so naming one is refused as not found.

**Module boundaries.** The `learning-paths` module owns both tables. It reads lessons only through `LessonService.publishedSummaries`, inside its own transaction.

## Consequences

- Units are not shared between paths. A unit that several paths need is copied. If shared units become a requirement, they move to their own versioned rows.
- Rewording a lesson changes what a live path shows without a path review. Reviewers approve a path's structure, and each lesson's own review covers its content.
- Order is not enforced yet. Unlocking lessons in sequence depends on progress, which is the next slice.
- Assigning a path to a class or learner (`teacher.assign_learning_path`) belongs to Stage 8.
