# ADR-007: Transactional Outbox for Domain Events

**Status:** Accepted, 2026-10-31

## Decision

1. A use case writes its event to `outbox_events` in the same transaction as the state change.
2. The worker's relay claims unpublished rows with `FOR UPDATE SKIP LOCKED` and publishes them to a BullMQ queue, keyed by event id so a retried publish cannot create a duplicate job.
3. Consumers record `(event_id, consumer)` in `consumed_events` in the same transaction as their work. A duplicate delivery becomes a no-op.
4. Each event carries id, type, version, aggregate id, tenant id, timestamp, correlation id and a payload validated against a schema in `packages/contracts`.

Delivery is at-least-once, and exactly-once in effect through the consumer check.

## Consequences

- The relay runs as `impulse_system`, since events span tenants.
- Ordering is not guaranteed across aggregates. Consumers must tolerate this.
- `outbox_events` needs a retention job for published rows (Stage 11).
- Event payloads never include personal data, only identifiers.
