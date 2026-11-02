import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ContentTransitionRequest,
  contentTransitionRequestSchema,
  type CreateLearningPathRequest,
  createLearningPathRequestSchema,
  learnerPathSchema,
  learnerPathSummarySchema,
  learningPathVersionViewSchema,
  learningPathViewSchema,
  type ListLearningPathsQuery,
  listLearningPathsQuerySchema,
  type ReviewQueueQuery,
  reviewQueueQuerySchema,
  type SaveLearningPathDraftRequest,
  saveLearningPathDraftRequestSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodQuery, ZodResponse } from '../../../common/zod.js';
import { LearningPathService } from '../application/learning-path.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
type IdParams = z.infer<typeof idParamsSchema>;

@ApiTags('learning-paths')
@Controller()
export class LearningPathsController {
  constructor(private readonly paths: LearningPathService) {}

  // Learners. Only published path versions, and only lessons that are live.

  @Get('learn/paths')
  @RequirePermissions('student.learn')
  @ZodResponse(z.array(learnerPathSummarySchema))
  published(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listLearningPathsQuerySchema) query: ListLearningPathsQuery,
  ) {
    return this.paths.listPublished(actor, query);
  }

  @Get('learn/paths/:id')
  @RequirePermissions('student.learn')
  @ZodResponse(learnerPathSchema)
  learn(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.paths.learn(actor, params.id);
  }

  // Authors and reviewers. Content roles are checked in the service, since any one will do.

  @Get('learning-paths')
  @Authenticated()
  @ZodResponse(z.array(learningPathViewSchema))
  list(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listLearningPathsQuerySchema) query: ListLearningPathsQuery,
  ) {
    return this.paths.list(actor, query);
  }

  @Post('learning-paths')
  @RequirePermissions('content.create')
  @ZodResponse(learningPathViewSchema, 201)
  create(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createLearningPathRequestSchema) body: CreateLearningPathRequest,
  ) {
    return this.paths.create(actor, body);
  }

  @Get('learning-paths/:id')
  @Authenticated()
  @ZodResponse(learningPathViewSchema)
  get(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.paths.get(actor, params.id);
  }

  @Put('learning-paths/:id/draft')
  @RequirePermissions('content.edit')
  @ZodResponse(learningPathViewSchema)
  saveDraft(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(saveLearningPathDraftRequestSchema) body: SaveLearningPathDraftRequest,
  ) {
    return this.paths.saveDraft(actor, params.id, body.content);
  }

  @Get('learning-path-versions/review-queue')
  @Authenticated()
  @ZodResponse(z.array(learningPathViewSchema))
  reviewQueue(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(reviewQueueQuerySchema) query: ReviewQueueQuery,
  ) {
    return this.paths.reviewQueue(actor, query.state);
  }

  @Post('learning-path-versions/:id/transitions')
  @HttpCode(200)
  @Authenticated()
  @ZodResponse(learningPathVersionViewSchema)
  transition(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(contentTransitionRequestSchema) body: ContentTransitionRequest,
  ) {
    return this.paths.transition(actor, params.id, body.action, body.reason);
  }
}
