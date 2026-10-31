import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CreateInvitationRequest,
  createInvitationRequestSchema,
  type CreateOrganizationUnitRequest,
  createOrganizationUnitRequestSchema,
  invitationViewSchema,
  memberViewSchema,
  organizationViewSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import { CurrentTenantActor, RateLimit, RequirePermissions } from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodResponse } from '../../../common/zod.js';
import { OrganizationService } from '../application/organization.service.js';

const memberParamsSchema = z.object({ userId: z.uuid() });

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @Get('units')
  @RequirePermissions('organization.view')
  @ZodResponse(z.array(organizationViewSchema))
  listUnits(@CurrentTenantActor() actor: TenantActor) {
    return this.organizations.listUnits(actor);
  }

  @Post('units')
  @RequirePermissions('organization.manage_structure')
  @ZodResponse(organizationViewSchema, 201)
  createUnit(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createOrganizationUnitRequestSchema) body: CreateOrganizationUnitRequest,
  ) {
    return this.organizations.createUnit(actor, body);
  }

  @Get('members')
  @RequirePermissions('organization.manage_members')
  @ZodResponse(z.array(memberViewSchema))
  listMembers(@CurrentTenantActor() actor: TenantActor) {
    return this.organizations.listMembers(actor);
  }

  @Delete('members/:userId')
  @HttpCode(204)
  @RequirePermissions('organization.manage_members')
  removeMember(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(memberParamsSchema) params: z.infer<typeof memberParamsSchema>,
  ) {
    return this.organizations.removeMember(actor, params.userId);
  }

  @Post('invitations')
  @RequirePermissions('organization.manage_members')
  @RateLimit({ name: 'invitations', limit: 30, windowSeconds: 3600 })
  @ZodResponse(invitationViewSchema, 201)
  invite(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createInvitationRequestSchema) body: CreateInvitationRequest,
  ) {
    return this.organizations.invite(actor, body);
  }
}
