import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult, SessionView, TokenTransport } from '@impulse/contracts';
import type { CookieOptions, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config.js';
import { csrfTokenFor } from '../domain/tokens.js';
import { AccessDirectory } from './access-directory.js';
import { AccountService } from './account.service.js';
import { MfaService } from './mfa.service.js';
import type { IssuedTokens } from './session.service.js';

export const ACCESS_COOKIE = 'iw_at';
export const REFRESH_COOKIE = 'iw_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Turns issued tokens into a client response, for whichever transport the client chose. */
@Injectable()
export class AuthResponder {
  constructor(
    private readonly accounts: AccountService,
    private readonly directory: AccessDirectory,
    private readonly mfa: MfaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async respond(
    tokens: IssuedTokens,
    tenantId: string | null,
    transport: TokenTransport,
    res: Response,
  ): Promise<AuthResult> {
    const view = await this.sessionView(tokens.userId, tenantId);
    const base = { ...view, accessTokenExpiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS };

    if (transport === 'bearer') {
      return { ...base, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    }

    this.setAccessCookie(res, tokens.accessToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.config.REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
    return { ...base, csrfToken: this.csrfTokenFor(tokens.sessionId) };
  }

  csrfTokenFor(sessionId: string): string {
    return csrfTokenFor(sessionId, this.config.AUTH_CSRF_SECRET);
  }

  setAccessCookie(res: Response, accessToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...this.cookieOptions(),
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
  }

  clearCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieOptions(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), path: REFRESH_COOKIE_PATH });
  }

  async sessionView(userId: string, tenantId: string | null): Promise<SessionView> {
    const [user, tenants, permissions, mfaEnabled] = await Promise.all([
      this.accounts.summarize(userId),
      this.directory.listMemberships(userId),
      this.directory.resolvePermissions(userId, tenantId),
      this.mfa.isEnabled(userId),
    ]);
    return {
      user,
      activeTenantId: tenantId,
      tenants,
      permissions: [...(permissions ?? [])],
      mfaEnabled,
    };
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.NODE_ENV === 'production' };
  }
}
