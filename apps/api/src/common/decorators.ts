import {
  createParamDecorator,
  type CustomDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Permission } from '@impulse/contracts';
import type { Request } from 'express';
import { AppError } from './app-error.js';
import type { Actor, TenantActor } from './request-context.js';

export const ACCESS_METADATA = 'impulse:access';

export type AccessRule =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'permissions'; permissions: Permission[] };

/**
 * Every route declares exactly one of the three access rules below. A route with none is denied
 * at runtime, and test/integration/route-access.test.ts fails on it.
 */
export const Public = (): CustomDecorator => SetMetadata(ACCESS_METADATA, { type: 'public' });

/** Any signed-in user. Resource-level checks are still the handler's responsibility. */
export const Authenticated = (): CustomDecorator =>
  SetMetadata(ACCESS_METADATA, { type: 'authenticated' });

/** All listed permissions are required in the active tenant. */
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator =>
  SetMetadata(ACCESS_METADATA, { type: 'permissions', permissions });

export const RATE_LIMIT_METADATA = 'impulse:rate-limit';

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  /** Credential endpoints refuse requests when the limiter is down (ADR-005). */
  failClosed?: boolean;
}

export const RateLimit = (rule: RateLimitRule): CustomDecorator =>
  SetMetadata(RATE_LIMIT_METADATA, rule);

export type RequestWithActor = Request & { actor?: Actor };

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<RequestWithActor>().actor;
  if (!actor) {
    throw AppError.unauthenticated();
  }
  return actor;
});

/** For routes that only make sense inside a tenant. */
export const CurrentTenantActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantActor => {
    const actor = ctx.switchToHttp().getRequest<RequestWithActor>().actor;
    if (!actor) {
      throw AppError.unauthenticated();
    }
    if (!actor.tenantId) {
      throw AppError.forbidden('No active tenant');
    }
    return actor as TenantActor;
  },
);
