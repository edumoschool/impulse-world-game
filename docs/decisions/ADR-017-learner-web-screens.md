# ADR-017: Learner Web Screens

**Status:** Accepted, 2026-11-03

## Context

Stage 3 is accepted when a learner completes a lesson and an assessment in the web app. The API for lessons, paths, assessments and progress exists (ADR-014 to ADR-016). Children aged 5 to 12 use phones, tablets and computers, sometimes with a keyboard or switch, and CLAUDE.md says client code never decides scores.

## Decision

**Screens.** A child's home (`/play`) keeps the greeting and lists paths, lessons and quizzes. Further screens:

- `/play/lessons/[id]` reads a lesson and records "I finished this lesson".
- `/play/paths/[id]` shows units with done and locked lessons.
- `/play/quizzes/[id]` takes a quiz one question at a time and shows the server's result.
- `/play/progress` shows lessons finished and a six-step mastery bar per skill.

All interface text is in `packages/localization`. Authored content picks its language with `pickLocalized`.

**One question component for every type, and it never marks.** `QuestionInput` only builds a `QuestionResponse`. It has no answer key and shows no correctness. Quiz answers are saved when the learner moves to another question and before submitting, and the result screen shows the server's outcome for each item.

**Accessible inputs instead of gestures.** Matching and drag and drop use a select per item, and ordering uses up and down buttons. Both work by touch, keyboard and switch, and need no drag library. Each choice is a large labelled row.

**Two question types and media are not supported yet.** Audio answers need uploads, and hotspots need the picture served. No asset route exists yet, so those questions say so and can be skipped. Lesson pictures, sound and video show their required text alternatives instead: alt text, or a transcript.

**Lesson questions are practice.** There is no endpoint that marks a lesson question, so a lesson's questions take an answer and say that quizzes check answers.

**Shared packages wait.** `packages/ui`, `design-tokens` and `api-client` are not created, following ADR-010, because only one app uses these pieces.

## Consequences

- The authoring and review screens are still missing. Staff use the API until they arrive.
- Clearing a saved quiz answer keeps the saved value, because the API has no way to delete a response.
- The e2e journey sets up content through the API and needs the SMTP sink for invitations, like the school journey. It is skipped if the SMTP port is taken.
- Once assets are served, the image, audio, video and hotspot paths need their real players, and a test each.
