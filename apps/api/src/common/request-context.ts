import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Permission, UserKind } from '@impulse/contracts';

export interface Actor {
  userId: string;
  sessionId: string;
  kind: UserKind;
  /** Null for a signed-in user with no tenant membership, such as a platform administrator. */
  tenantId: string | null;
  permissions: ReadonlySet<Permission>;
  mfaVerified: boolean;
}

/** An actor known to be acting inside a tenant. */
export type TenantActor = Actor & { tenantId: string };

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithRequestContext<T>(requestId: string, work: () => T): T {
  return storage.run({ requestId }, work);
}

/** Correlation id for logs and events. Background work outside a request gets a fresh one. */
export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? randomUUID();
}
