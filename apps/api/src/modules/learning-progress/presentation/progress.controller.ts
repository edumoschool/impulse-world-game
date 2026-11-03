import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { learnerProgressSchema, lessonCompletionSchema } from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodParams, ZodResponse } from '../../../common/zod.js';
import { ProgressService } from '../application/progress.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
type IdParams = z.infer<typeof idParamsSchema>;

@ApiTags('progress')
@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Post('learn/lessons/:id/complete')
  @HttpCode(200)
  @RequirePermissions('student.learn')
  @ZodResponse(lessonCompletionSchema)
  complete(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.progress.completeLesson(actor, params.id);
  }

  @Get('learn/progress')
  @RequirePermissions('student.view_own_progress')
  @ZodResponse(learnerProgressSchema)
  mine(@CurrentTenantActor() actor: TenantActor) {
    return this.progress.myProgress(actor);
  }

  /** Guardians and staff who may view the child. The child access policy decides. */
  @Get('children/:id/progress')
  @Authenticated()
  @ZodResponse(learnerProgressSchema)
  child(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.progress.childProgress(actor, params.id);
  }
}
