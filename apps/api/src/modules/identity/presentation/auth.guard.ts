import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, requiresMfa } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import {
  ACCESS_METADATA,
  type AccessRule,
  type RequestWithActor,
} from '../../../common/decorators.js';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { AccessDirectory } from '../application/access-directory.js';
import { ACCESS_COOKIE } from '../application/auth-responder.js';
import { SessionService } from '../application/session.service.js';
import { isValidCsrfToken } from '../domain/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global guard. Any route without an access rule is denied. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly directory: AccessDirectory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.type === 'public') {
      return true;
    }
    if (!rule) {
      throw AppError.forbidden();
    }

    const request = context.switchToHttp().getRequest<RequestWithActor>();
    const { token, fromCookie } = readToken(request);
    if (!token) {
      throw AppError.unauthenticated();
    }

    const claims = await this.sessions.verifyAccessToken(token);
    const session = await this.sessions.loadActive(claims.sessionId);
    if (session.userId !== claims.userId) {
      throw AppError.unauthenticated();
    }

    // Bearer tokens are never sent automatically by a browser, so only cookies need this.
    if (fromCookie && !SAFE_METHODS.has(request.method)) {
      const header = request.header('x-csrf-token') ?? '';
      if (!isValidCsrfToken(session.id, this.config.AUTH_CSRF_SECRET, header)) {
        throw new AppError(ERROR_CODES.CSRF_INVALID, 403, 'Invalid CSRF token');
      }
    }

    // The tenant comes from the stored session and is re-checked here, so removing a member
    // takes effect on their next request rather than when their token expires.
    const tenantId = session.activeTenantId;
    const permissions = await this.directory.resolvePermissions(session.userId, tenantId);
    if (!permissions) {
      throw AppError.forbidden('You are no longer a member of this organization');
    }

    const mfaVerified = session.mfaVerifiedAt !== null;
    request.actor = {
      userId: session.userId,
      sessionId: session.id,
      kind: claims.kind,
      tenantId,
      permissions,
      mfaVerified,
    };

    if (rule.type === 'permissions') {
      for (const permission of rule.permissions) {
        if (!permissions.has(permission)) {
          throw AppError.forbidden();
        }
        if (requiresMfa(permission) && !mfaVerified) {
          throw new AppError(
            ERROR_CODES.MFA_REQUIRED,
            403,
            'This action requires a session verified with MFA',
          );
        }
      }
    }
    return true;
  }
}

function readToken(request: RequestWithActor): { token?: string; fromCookie: boolean } {
  const header = request.header('authorization');
  if (header?.startsWith('Bearer ')) {
    return { token: header.slice('Bearer '.length), fromCookie: false };
  }
  const cookies = request.cookies as Record<string, string> | undefined;
  return { token: cookies?.[ACCESS_COOKIE], fromCookie: true };
}
