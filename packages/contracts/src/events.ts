import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Versioned domain event catalogue (spec section 33). Payloads hold identifiers only and never
 * personal data, because events outlive erasure requests and cross module boundaries.
 */
export const EVENT_PAYLOADS = {
  'user.created': z.object({ userId: uuidSchema, kind: z.enum(['ADULT', 'CHILD']) }),
  'tenant.created': z.object({ tenantId: uuidSchema, kind: z.string() }),
  'child.authorized': z.object({ childId: uuidSchema, consentId: uuidSchema }),
  'child.consent_revoked': z.object({ childId: uuidSchema, consentId: uuidSchema }),
  'guardian.linked': z.object({ childId: uuidSchema, guardianUserId: uuidSchema }),
  'member.joined': z.object({ userId: uuidSchema, organizationId: uuidSchema }),
  /** A version became the live one. itemType names the content kind, such as "question". */
  'content.published': z.object({
    itemType: z.string(),
    itemId: uuidSchema,
    versionId: uuidSchema,
  }),
} as const;

export type EventType = keyof typeof EVENT_PAYLOADS;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_PAYLOADS)[T]>;

export const EVENT_TYPES = Object.keys(EVENT_PAYLOADS) as EventType[];

export interface DomainEventEnvelope<T extends EventType = EventType> {
  id: string;
  type: T;
  version: number;
  aggregateId: string;
  tenantId: string | null;
  occurredAt: string;
  correlationId: string;
  payload: EventPayload<T>;
}

export const domainEventEnvelopeSchema = z.object({
  id: uuidSchema,
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  version: z.number().int().positive(),
  aggregateId: uuidSchema,
  tenantId: uuidSchema.nullable(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string().min(1),
  payload: z.unknown(),
});

export function parseEventPayload<T extends EventType>(type: T, payload: unknown): EventPayload<T> {
  return EVENT_PAYLOADS[type].parse(payload) as EventPayload<T>;
}
