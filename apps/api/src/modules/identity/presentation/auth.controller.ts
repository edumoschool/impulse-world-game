import { Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  authResultSchema,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  idParamsSchema,
  type IdParams,
  type LoginRequest,
  loginRequestSchema,
  type MfaConfirmRequest,
  mfaConfirmRequestSchema,
  type MfaDisableRequest,
  mfaDisableRequestSchema,
  mfaRecoveryCodesSchema,
  type MfaRegenerateRequest,
  mfaRegenerateRequestSchema,
  mfaStatusSchema,
  type RefreshRequest,
  refreshRequestSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  sessionViewSchema,
  type SwitchTenantRequest,
  switchTenantRequestSchema,
} from '@impulse/contracts';
import type { Request, Response } from 'express';
import { AppError } from '../../../common/app-error.js';
import { Authenticated, CurrentActor, Public, RateLimit } from '../../../common/decorators.js';
import type { Actor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodResponse } from '../../../common/zod.js';
import { AccountService } from '../application/account.service.js';
import { AuthResponder, REFRESH_COOKIE } from '../application/auth-responder.js';
import { AuthService } from '../application/auth.service.js';
import { MfaService } from '../application/mfa.service.js';
import { SessionService } from '../application/session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly responder: AuthResponder,
    private readonly mfa: MfaService,
    private readonly accounts: AccountService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ name: 'login', limit: 20, windowSeconds: 60, failClosed: true })
  @ZodResponse(authResultSchema)
  async login(
    @ZodBody(loginRequestSchema) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, tenantId } = await this.auth.login(body);
    return this.responder.respond(tokens, tenantId, body.transport, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ name: 'refresh', limit: 60, windowSeconds: 60, failClosed: true })
  @ZodResponse(authResultSchema)
  async refresh(
    @ZodBody(refreshRequestSchema) body: RefreshRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const raw = body.refreshToken ?? cookies?.[REFRESH_COOKIE];
    if (!raw) {
      throw AppError.unauthenticated('A refresh token is required');
    }
    const tokens = await this.sessions.refresh(raw);
    const session = await this.sessions.loadActive(tokens.sessionId);
    return this.responder.respond(tokens, session.activeTenantId, body.transport, res);
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(actor.sessionId, 'LOGOUT');
    this.responder.clearCookies(res);
  }

  @Authenticated()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeAllForUser(actor.userId, 'LOGOUT_ALL');
    this.responder.clearCookies(res);
  }

  @Authenticated()
  @Get('session')
  @ZodResponse(sessionViewSchema)
  async session(@CurrentActor() actor: Actor, @Req() req: Request) {
    const view = await this.responder.sessionView(actor.userId, actor.tenantId);
    const usesCookie = !req.header('authorization');
    return usesCookie ? { ...view, csrfToken: this.responder.csrfTokenFor(actor.sessionId) } : view;
  }

  @Authenticated()
  @Get('sessions')
  listSessions(@CurrentActor() actor: Actor) {
    return this.sessions.listForUser(actor.userId, actor.sessionId);
  }

  @Authenticated()
  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentActor() actor: Actor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.sessions.revokeOwned(actor.userId, params.id);
  }

  @Authenticated()
  @Post('switch-tenant')
  @HttpCode(200)
  @RateLimit({ name: 'switch-tenant', limit: 30, windowSeconds: 60 })
  async switchTenant(
    @CurrentActor() actor: Actor,
    @ZodBody(switchTenantRequestSchema) body: SwitchTenantRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.auth.switchTenant(actor, body.tenantId);
    const fromBearer = req.header('authorization')?.startsWith('Bearer ') ?? false;
    const view = await this.responder.sessionView(actor.userId, body.tenantId);
    if (fromBearer) {
      return { ...view, accessToken };
    }
    this.responder.setAccessCookie(res, accessToken);
    return view;
  }

  /** Always 202, so the response never reveals whether an account exists. */
  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @RateLimit({ name: 'password-forgot', limit: 5, windowSeconds: 900, failClosed: true })
  forgotPassword(@ZodBody(forgotPasswordRequestSchema) body: ForgotPasswordRequest) {
    this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @RateLimit({ name: 'password-reset', limit: 10, windowSeconds: 900, failClosed: true })
  resetPassword(@ZodBody(resetPasswordRequestSchema) body: ResetPasswordRequest) {
    return this.auth.resetPassword(body.token, body.newPassword);
  }

  @Authenticated()
  @Get('mfa')
  @ZodResponse(mfaStatusSchema)
  mfaStatus(@CurrentActor() actor: Actor) {
    return this.mfa.status(actor.userId);
  }

  @Authenticated()
  @Post('mfa/enroll')
  async enrollMfa(@CurrentActor() actor: Actor) {
    requireAdult(actor);
    const email = await this.accounts.getEmail(actor.userId);
    return this.mfa.enroll(actor.userId, email ?? actor.userId);
  }

  /** Returns the first recovery codes. They are never shown again. */
  @Authenticated()
  @Post('mfa/confirm')
  @HttpCode(200)
  @RateLimit({ name: 'mfa-confirm', limit: 10, windowSeconds: 300, failClosed: true })
  @ZodResponse(mfaRecoveryCodesSchema)
  confirmMfa(
    @CurrentActor() actor: Actor,
    @ZodBody(mfaConfirmRequestSchema) body: MfaConfirmRequest,
  ) {
    requireAdult(actor);
    return this.mfa.confirm(actor.userId, body.code, actor.sessionId);
  }

  @Authenticated()
  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @RateLimit({ name: 'mfa-recovery-codes', limit: 5, windowSeconds: 300, failClosed: true })
  @ZodResponse(mfaRecoveryCodesSchema)
  regenerateRecoveryCodes(
    @CurrentActor() actor: Actor,
    @ZodBody(mfaRegenerateRequestSchema) body: MfaRegenerateRequest,
  ) {
    requireAdult(actor);
    return this.mfa.regenerateRecoveryCodes(actor.userId, body.code);
  }

  @Authenticated()
  @Post('mfa/disable')
  @HttpCode(204)
  @RateLimit({ name: 'mfa-disable', limit: 5, windowSeconds: 900, failClosed: true })
  disableMfa(
    @CurrentActor() actor: Actor,
    @ZodBody(mfaDisableRequestSchema) body: MfaDisableRequest,
  ) {
    requireAdult(actor);
    return this.mfa.disable(actor.userId, body.password, body.code);
  }
}

/** Children have no authenticator: their accounts are managed by an adult. */
function requireAdult(actor: Actor): void {
  if (actor.kind !== 'ADULT') {
    throw AppError.forbidden();
  }
}
