# ADR-008: Zod Contracts in One Shared Package

**Status:** Accepted, 2026-10-31

## Decision

`packages/contracts` holds the single definition of request and response schemas, the permission catalogue, the event catalogue and error codes. It depends only on Zod, so it is safe for web, mobile and server.

The API validates every request body, query and parameter through a pipe that takes these schemas. Unknown keys are stripped, which also means no client-supplied `tenantId` can ever reach a handler. OpenAPI request bodies are generated from the same schemas with `z.toJSONSchema`.

## Consequences

- API contract changes are type errors in every client, so they cannot drift silently.
- class-validator is not used, which avoids two validation styles.
