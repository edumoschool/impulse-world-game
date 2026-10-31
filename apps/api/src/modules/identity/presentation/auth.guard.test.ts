import 'reflect-metadata';
import type { Reflector } from '@nestjs/core';
import { ERROR_CODES, type Permission } from '@impulse/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AccessRule } from '../../../common/decorators.js';
import type { AppConfig } from '../../../config/app-config.js';
import type { AccessDirectory } from '../application/access-directory.js';
import type { SessionService } from '../application/session.service.js';
import { AuthGuard } from './auth.guard.js';

const SESSION = { id: 'session-1', userId: 'user-1', activeTenantId: 'tenant-1' };

function setup(options: {
  rule: AccessRule | undefined;
  permissions: Permission[] | null;
  mfaVerified?: boolean;
}) {
  const reflector = { getAllAndOverride: () => options.rule } as unknown as Reflector;
  const sessions = {
    verifyAccessToken: vi.fn(async () => ({
      userId: 'user-1',
      sessionId: 'session-1',
      tenantId: 'a-tenant-from-the-token',
      kind: 'ADULT',
    })),
    loadActive: vi.fn(async () => ({
      ...SESSION,
      mfaVerifiedAt: options.mfaVerified ? new Date() : null,
    })),
  } as unknown as SessionService;
  const directory = {
    resolvePermissions: vi.fn(async () =>
      options.permissions === null ? null : new Set(options.permissions),
    ),
  } as unknown as AccessDirectory;
  const guard = new AuthGuard(reflector, sessions, directory, {
    AUTH_CSRF_SECRET: 'x'.repeat(32),
  } as AppConfig);

  const request = {
    method: 'GET',
    header: (name: string) => (name === 'authorization' ? 'Bearer token' : undefined),
  };
  const context = {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return { guard, context: context as never, request };
}

describe('AuthGuard', () => {
  it('denies a route that declares no access rule', async () => {
    const { guard, context } = setup({ rule: undefined, permissions: [] });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('requires every listed permission', async () => {
    const { guard, context } = setup({
      rule: {
        type: 'permissions',
        permissions: ['organization.view', 'organization.manage_members'],
      },
      permissions: ['organization.view'],
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('allows a tenant permission without MFA', async () => {
    const { guard, context } = setup({
      rule: { type: 'permissions', permissions: ['organization.view'] },
      permissions: ['organization.view'],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('blocks a platform permission on a session that has not passed MFA', async () => {
    const { guard, context } = setup({
      rule: { type: 'permissions', permissions: ['platform.manage_users'] },
      permissions: ['platform.manage_users'],
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ERROR_CODES.MFA_REQUIRED,
    });
  });

  it('allows a platform permission on an MFA-verified session', async () => {
    const { guard, context } = setup({
      rule: { type: 'permissions', permissions: ['platform.manage_users'] },
      permissions: ['platform.manage_users'],
      mfaVerified: true,
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('refuses a user whose tenant membership is gone', async () => {
    const { guard, context } = setup({ rule: { type: 'authenticated' }, permissions: null });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 403 });
  });

  it('takes the tenant from the stored session, not from the token claims', async () => {
    const { guard, context, request } = setup({ rule: { type: 'authenticated' }, permissions: [] });
    await guard.canActivate(context);
    expect((request as { actor?: { tenantId: string } }).actor?.tenantId).toBe('tenant-1');
  });
});
