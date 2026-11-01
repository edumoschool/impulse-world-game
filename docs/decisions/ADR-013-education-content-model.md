# ADR-013: Education Content Model

**Status:** Accepted, 2026-11-01

## Context

Stage 3 adds subjects, skills, lessons, questions and assessments. The spec requires an immutable version for every published resource (8.3), a reviewed lifecycle where only authorized reviewers approve (8.4), results that keep the version they were taken against, and teaching in Uzbek, English and Russian. The tenancy model is already decided: education content is global plus tenant (`G+T`, see [tenancy](../architecture/tenancy.md)).

## Decision

**Two kinds of content.**

- **Taxonomy:** subjects, grade levels, skills and prerequisites. It is reference data that other content points at. It has no lifecycle. People with `content.edit` change it in place, and anything that has been referenced is archived rather than deleted.
- **Teaching material:** lessons, questions and assessments. Its text is stored on `*_versions` rows, and each version moves through the lifecycle.

**Lifecycle.** `DRAFT → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED`. A reviewer can send `IN_REVIEW` or `APPROVED` back to `DRAFT` with a reason. The rules live in one pure state machine (`modules/content/domain/lifecycle.ts`), which every versioned module uses:

- Submitting needs `content.submit_for_review`, approving and rejecting need `content.review`, and publishing needs `content.publish`.
- The author of a version can never approve or publish it, whatever roles they hold. This holds for a reviewer approving their own work too.
- Only `DRAFT` versions can be edited. A change to published material is a new version, so a published version's body is never written again.
- Publishing a version archives the previously published version of the same item. At most one version per item is published.

**Pinning.** Attempts, results and progress store the version id they used, never only the item id. Historical results therefore keep their original content.

**Global content.** Rows with `tenant_id IS NULL` are platform content. Every tenant can read them, and the request role cannot write them: RLS allows `SELECT` on `tenant_id IS NULL OR tenant_id = app_current_tenant()`, and allows writes only on the current tenant. Platform content is loaded by the reviewed seed through the system role until platform authoring arrives in Stage 10. A school's own content is private to it, as for any tenant table.

**Localized text.** Translatable fields are JSONB maps from locale to text, such as `{"uz": "...", "en": "...", "ru": "..."}`, validated by a shared contract. At least one language is required. Readers fall back from the requested language to English, then Uzbek, then Russian. This replaces the spec's separate `*_translations` tables. The text of a version is part of what gets reviewed and frozen, so storing it on the version row keeps the version immutable in one place, and reads need no join.

**Answer checking.** Each of the 11 question types has a pure evaluator (`modules/questions/domain/evaluate.ts`). It takes the question version's answer key and a response, and returns a score from 0 to 1. The server always evaluates; clients never decide correctness (CLAUDE.md).

- Partial credit applies to multiple select, matching, ordering, drag and drop, and fill in the blank. In multiple select, each wrong pick cancels a right one, so selecting every option scores no better than guessing.
- "Image-based questions" are tap-the-picture hotspots, with regions in 0 to 1 coordinates.
- Interactive scenarios are branching steps. Authors score each choice, and a finished path scores the average of its choices.
- Audio responses, and short text that matches no accepted answer, return `NEEDS_REVIEW` for a person to mark.
- Learners get the question without its answer key. Items whose authored order could reveal the answer are shuffled, seeded by the attempt, so a reload shows the same order.

## Consequences

- A per-locale review workflow, where one language is approved while another is still in draft, is not possible with JSONB text. If that becomes a requirement, translations move to their own versioned rows.
- Grade levels and the six core subjects are seeded as global rows. Schools add their own subjects and skills alongside them.
- A skill prerequisite cannot create a cycle, which is checked when the prerequisite is added. A school skill may depend on a global skill, never the reverse.
