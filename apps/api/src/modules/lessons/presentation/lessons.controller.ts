import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ContentTransitionRequest,
  contentTransitionRequestSchema,
  type CreateLessonRequest,
  createLessonRequestSchema,
  learnerLessonSchema,
  learnerLessonSummarySchema,
  type ListLessonsQuery,
  listLessonsQuerySchema,
  lessonVersionViewSchema,
  lessonViewSchema,
  type ReviewQueueQuery,
  reviewQueueQuerySchema,
  type SaveLessonDraftRequest,
  saveLessonDraftRequestSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodQuery, ZodResponse } from '../../../common/zod.js';
import { LessonService } from '../application/lesson.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
type IdParams = z.infer<typeof idParamsSchema>;

@ApiTags('lessons')
@Controller()
export class LessonsController {
  constructor(private readonly lessons: LessonService) {}

  // Learners. Responses are validated against learner schemas, which have no answer keys.

  @Get('learn/lessons')
  @RequirePermissions('student.learn')
  @ZodResponse(z.array(learnerLessonSummarySchema))
  published(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listLessonsQuerySchema) query: ListLessonsQuery,
  ) {
    return this.lessons.listPublished(actor, query.subjectId);
  }

  @Get('learn/lessons/:id')
  @RequirePermissions('student.learn')
  @ZodResponse(learnerLessonSchema)
  learn(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.lessons.learn(actor, params.id);
  }

  // Authors and reviewers. Content roles are checked in the service, since any one will do.

  @Get('lessons')
  @Authenticated()
  @ZodResponse(z.array(lessonViewSchema))
  list(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listLessonsQuerySchema) query: ListLessonsQuery,
  ) {
    return this.lessons.list(actor, query.subjectId);
  }

  @Post('lessons')
  @RequirePermissions('content.create')
  @ZodResponse(lessonViewSchema, 201)
  create(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createLessonRequestSchema) body: CreateLessonRequest,
  ) {
    return this.lessons.create(actor, body);
  }

  @Get('lessons/:id')
  @Authenticated()
  @ZodResponse(lessonViewSchema)
  get(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.lessons.get(actor, params.id);
  }

  @Put('lessons/:id/draft')
  @RequirePermissions('content.edit')
  @ZodResponse(lessonViewSchema)
  saveDraft(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(saveLessonDraftRequestSchema) body: SaveLessonDraftRequest,
  ) {
    return this.lessons.saveDraft(actor, params.id, body.content);
  }

  @Get('lesson-versions/review-queue')
  @Authenticated()
  @ZodResponse(z.array(lessonViewSchema))
  reviewQueue(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(reviewQueueQuerySchema) query: ReviewQueueQuery,
  ) {
    return this.lessons.reviewQueue(actor, query.state);
  }

  @Post('lesson-versions/:id/transitions')
  @HttpCode(200)
  @Authenticated()
  @ZodResponse(lessonVersionViewSchema)
  transition(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(contentTransitionRequestSchema) body: ContentTransitionRequest,
  ) {
    return this.lessons.transition(actor, params.id, body.action, body.reason);
  }
}
