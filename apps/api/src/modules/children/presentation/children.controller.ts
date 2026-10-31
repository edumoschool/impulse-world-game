import { Controller, Delete, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  authResultSchema,
  type ChildConsentParams,
  childConsentParamsSchema,
  type ChildGuardianParams,
  childGuardianParamsSchema,
  type ChildLoginRequest,
  childLoginRequestSchema,
  childSettingsSchema,
  childViewSchema,
  type ConsentGrant,
  consentGrantSchema,
  consentViewSchema,
  type CreateChildRequest,
  createChildRequestSchema,
  guardianViewSchema,
  idParamsSchema,
  type IdParams,
  invitationViewSchema,
  type InviteGuardianRequest,
  inviteGuardianRequestSchema,
  type UpdateChildSettingsRequest,
  updateChildSettingsRequestSchema,
} from '@impulse/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  Public,
  RateLimit,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodResponse } from '../../../common/zod.js';
import { TenantDatabase } from '../../../infrastructure/database/tenant-database.js';
import { AuthResponder } from '../../identity/index.js';
import { OrganizationService } from '../../organizations/index.js';
import { ChildLoginService } from '../application/child-login.service.js';
import { ChildService } from '../application/child.service.js';

@ApiTags('children')
@Controller()
export class ChildrenController {
  constructor(
    private readonly children: ChildService,
    private readonly childLogin: ChildLoginService,
    private readonly responder: AuthResponder,
    private readonly organizations: OrganizationService,
    private readonly database: TenantDatabase,
  ) {}

  @Public()
  @Post('auth/child/login')
  @HttpCode(200)
  @RateLimit({ name: 'child-login', limit: 20, windowSeconds: 60, failClosed: true })
  @ZodResponse(authResultSchema)
  async login(
    @ZodBody(childLoginRequestSchema) body: ChildLoginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, tenantId } = await this.childLogin.login(body);
    return this.responder.respond(tokens, tenantId, body.transport, res);
  }

  @Post('children')
  @RequirePermissions('children.provision')
  @RateLimit({ name: 'child-create', limit: 30, windowSeconds: 3600 })
  @ZodResponse(childViewSchema, 201)
  create(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createChildRequestSchema) body: CreateChildRequest,
  ) {
    return this.children.create(actor, body);
  }

  @Get('children')
  @Authenticated()
  @ZodResponse(z.array(childViewSchema))
  list(@CurrentTenantActor() actor: TenantActor) {
    return this.children.list(actor);
  }

  @Get('children/:id')
  @Authenticated()
  @ZodResponse(childViewSchema)
  get(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.children.get(actor, params.id);
  }

  @Patch('children/:id/settings')
  @RequirePermissions('parent.manage_child_settings')
  @ZodResponse(childSettingsSchema)
  updateSettings(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(updateChildSettingsRequestSchema) body: UpdateChildSettingsRequest,
  ) {
    return this.children.updateSettings(actor, params.id, body);
  }

  @Get('children/:id/consents')
  @RequirePermissions('parent.manage_consent')
  @ZodResponse(z.array(consentViewSchema))
  listConsents(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
  ) {
    return this.children.listConsents(actor, params.id);
  }

  @Post('children/:id/consents')
  @RequirePermissions('parent.manage_consent')
  @ZodResponse(consentViewSchema, 201)
  grantConsent(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(consentGrantSchema) body: ConsentGrant,
  ) {
    return this.children.grantConsent(actor, params.id, body);
  }

  @Delete('children/:id/consents/:consentId')
  @HttpCode(204)
  @RequirePermissions('parent.manage_consent')
  revokeConsent(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(childConsentParamsSchema) params: ChildConsentParams,
  ) {
    return this.children.revokeConsent(actor, params.id, params.consentId);
  }

  @Get('children/:id/guardians')
  @RequirePermissions('parent.manage_guardians')
  @ZodResponse(z.array(guardianViewSchema))
  listGuardians(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
  ) {
    return this.children.listGuardians(actor, params.id);
  }

  @Post('children/:id/guardians')
  @RequirePermissions('parent.manage_guardians')
  @RateLimit({ name: 'guardian-invite', limit: 10, windowSeconds: 3600 })
  @ZodResponse(invitationViewSchema, 201)
  async inviteGuardian(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(inviteGuardianRequestSchema) body: InviteGuardianRequest,
  ) {
    await this.children.assertCanManageGuardians(actor, params.id);
    const organizationId = await this.database.run(
      { tenantId: actor.tenantId, userId: actor.userId },
      (tx) => this.organizations.rootId(tx, actor.tenantId),
    );
    return this.organizations.createInvitation(actor, {
      email: body.email,
      roleKey: 'PARENT',
      organizationId,
      guardianChildId: params.id,
      relationship: body.relationship,
    });
  }

  @Delete('children/:id/guardians/:userId')
  @HttpCode(204)
  @RequirePermissions('parent.manage_guardians')
  removeGuardian(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(childGuardianParamsSchema) params: ChildGuardianParams,
  ) {
    return this.children.removeGuardian(actor, params.id, params.userId);
  }
}
