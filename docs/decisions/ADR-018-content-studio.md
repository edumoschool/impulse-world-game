# ADR-018: Content Studio Screens

**Status:** Accepted, 2026-11-03

## Context

Schools write and review their own teaching material. The API already enforces the lifecycle (ADR-013), including that no one approves or publishes their own work. Staff had no screens for it, and the e2e journeys had to publish content through the API.

## Decision

**One studio at `/content`.** It shows question banks, lessons, quizzes and learning paths, with each item's newest state. Reviewers also see one queue of everything in review or approved. The dashboard links to the studio for anyone with a content permission.

**Every editor follows the API's draft rules, for display only.**

- A draft is editable by its author.
- A version in review is read-only.
- Saving over a live or archived version starts a new draft, and children keep the live one until the new one is published.

The version panel lists every version and offers only the steps this person may take. The author is never offered approve or publish. Sending back requires a note, which the author sees. The API applies every rule again, and its refusals are shown as translated messages.

**Authors write in one language at a time.** An "editing language" switch sets which language every field edits, and each field says which languages already have text. Three inputs per field would have tripled long forms like lessons. The contract's rule of at least one language per field is checked before saving.

**Forms are checked against the shared contracts in the browser.** Lesson, quiz, path and question forms build their content and validate it with the same Zod schemas the API uses, listing problems before anything is sent.

**Question forms.** One right answer, several right answers, true or false, ordering, fill the gaps and short written answer have structured forms. Matching, sorting into groups, spoken answers, tap the picture and stories with choices are written as JSON, checked against the same contract. They are rarer and need richer editors, which can replace the JSON field later without any API change.

**Pickers read what is published.** Lessons and quizzes can only add published question versions, and paths only published lessons, because the API refuses anything else at review time. The question picker reads bank by bank, which suits a school's library. A search route should replace it before libraries grow large.

## Consequences

- Skills are chosen when a question is created. The API has no route yet to change a question's skills later.
- Media blocks take a file name only. Uploading arrives with asset storage.
- Grade levels are not set from the studio yet, though the API accepts them.
- The e2e journeys now cover writing, sending back, fixing, approving and publishing in the browser, and a child seeing the result.
