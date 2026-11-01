import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AddPrerequisiteRequest,
  addPrerequisiteRequestSchema,
  type CreateSkillRequest,
  createSkillRequestSchema,
  type CreateSubjectRequest,
  createSubjectRequestSchema,
  gradeLevelViewSchema,
  type ListSkillsQuery,
  listSkillsQuerySchema,
  skillViewSchema,
  subjectViewSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodQuery, ZodResponse } from '../../../common/zod.js';
import { CurriculumService } from '../application/curriculum.service.js';

const skillParamsSchema = z.object({ id: z.uuid() });
const prerequisiteParamsSchema = z.object({ id: z.uuid(), prerequisiteId: z.uuid() });

/** Reading the taxonomy needs only membership: learners see subjects and skills too. */
@ApiTags('curriculum')
@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get('grade-levels')
  @Authenticated()
  @ZodResponse(z.array(gradeLevelViewSchema))
  gradeLevels(@CurrentTenantActor() actor: TenantActor) {
    return this.curriculum.listGradeLevels(actor);
  }

  @Get('subjects')
  @Authenticated()
  @ZodResponse(z.array(subjectViewSchema))
  subjects(@CurrentTenantActor() actor: TenantActor) {
    return this.curriculum.listSubjects(actor);
  }

  @Post('subjects')
  @RequirePermissions('content.edit')
  @ZodResponse(subjectViewSchema, 201)
  createSubject(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createSubjectRequestSchema) body: CreateSubjectRequest,
  ) {
    return this.curriculum.createSubject(actor, body);
  }

  @Get('skills')
  @Authenticated()
  @ZodResponse(z.array(skillViewSchema))
  skills(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listSkillsQuerySchema) query: ListSkillsQuery,
  ) {
    return this.curriculum.listSkills(actor, query.subjectId);
  }

  @Post('skills')
  @RequirePermissions('content.edit')
  @ZodResponse(skillViewSchema, 201)
  createSkill(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createSkillRequestSchema) body: CreateSkillRequest,
  ) {
    return this.curriculum.createSkill(actor, body);
  }

  @Post('skills/:id/prerequisites')
  @HttpCode(204)
  @RequirePermissions('content.edit')
  addPrerequisite(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(skillParamsSchema) params: z.infer<typeof skillParamsSchema>,
    @ZodBody(addPrerequisiteRequestSchema) body: AddPrerequisiteRequest,
  ) {
    return this.curriculum.addPrerequisite(actor, params.id, body.prerequisiteId);
  }

  @Delete('skills/:id/prerequisites/:prerequisiteId')
  @HttpCode(204)
  @RequirePermissions('content.edit')
  removePrerequisite(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(prerequisiteParamsSchema) params: z.infer<typeof prerequisiteParamsSchema>,
  ) {
    return this.curriculum.removePrerequisite(actor, params.id, params.prerequisiteId);
  }
}
