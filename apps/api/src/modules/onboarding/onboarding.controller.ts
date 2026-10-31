import { Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AcceptInvitationRequest,
  acceptInvitationRequestSchema,
  authResultSchema,
  type CreateInstitutionRequest,
  createInstitutionRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
} from '@impulse/contracts';
import type { Response } from 'express';
import { Authenticated, CurrentActor, Public, RateLimit } from '../../common/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ZodBody, ZodResponse } from '../../common/zod.js';
import { AuthResponder } from '../identity/index.js';
import { OnboardingService } from './onboarding.service.js';

@ApiTags('onboarding')
@Controller()
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly responder: AuthResponder,
  ) {}

  @Public()
  @Post('auth/register')
  @RateLimit({ name: 'register', limit: 10, windowSeconds: 3600, failClosed: true })
  @ZodResponse(authResultSchema, 201)
  async register(
    @ZodBody(registerRequestSchema) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, tenantId } = await this.onboarding.register(body);
    return this.responder.respond(tokens, tenantId, body.transport, res);
  }

  @Authenticated()
  @Post('organizations')
  @RateLimit({ name: 'institution-create', limit: 5, windowSeconds: 3600 })
  async createInstitution(
    @CurrentActor() actor: Actor,
    @ZodBody(createInstitutionRequestSchema) body: CreateInstitutionRequest,
  ) {
    return { tenantId: await this.onboarding.createInstitution(actor, body) };
  }

  @Authenticated()
  @Post('invitations/accept')
  @HttpCode(200)
  @RateLimit({ name: 'invitation-accept', limit: 10, windowSeconds: 300, failClosed: true })
  async acceptInvitation(
    @CurrentActor() actor: Actor,
    @ZodBody(acceptInvitationRequestSchema) body: AcceptInvitationRequest,
  ) {
    return { tenantId: await this.onboarding.acceptInvitation(actor, body) };
  }
}
