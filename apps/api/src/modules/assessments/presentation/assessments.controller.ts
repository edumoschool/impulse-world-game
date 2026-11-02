import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ContentTransitionRequest,
  contentTransitionRequestSchema,
  type CreateAssessmentRequest,
  createAssessmentRequestSchema,
  learnerAssessmentSummarySchema,
  learnerAttemptSchema,
  type ListAssessmentsQuery,
  listAssessmentsQuerySchema,
  assessmentVersionViewSchema,
  assessmentViewSchema,
  type ReviewQueueQuery,
  reviewQueueQuerySchema,
  savedResponseSchema,
  type SaveAssessmentDraftRequest,
  saveAssessmentDraftRequestSchema,
  type SaveResponseRequest,
  saveResponseRequestSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodQuery, ZodResponse } from '../../../common/zod.js';
import { AssessmentAuthoringService } from '../application/assessment-authoring.service.js';
import { AttemptService } from '../application/attempt.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
type IdParams = z.infer<typeof idParamsSchema>;
const itemParamsSchema = z.object({ id: z.uuid(), itemId: z.string().trim().min(1).max(64) });
type ItemParams = z.infer<typeof itemParamsSchema>;

@ApiTags('assessments')
@Controller()
export class AssessmentsController {
  constructor(
    private readonly authoring: AssessmentAuthoringService,
    private readonly attempts: AttemptService,
  ) {}

  // Learners. Responses are validated against learner schemas, which have no answer keys.

  @Get('learn/assessments')
  @RequirePermissions('student.learn')
  @ZodResponse(z.array(learnerAssessmentSummarySchema))
  published(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listAssessmentsQuerySchema) query: ListAssessmentsQuery,
  ) {
    return this.attempts.listPublished(actor, query);
  }

  /** Starts an attempt on the live version, or resumes the learner's open one. */
  @Post('learn/assessments/:id/attempts')
  @HttpCode(200)
  @RequirePermissions('student.learn')
  @ZodResponse(learnerAttemptSchema)
  start(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.attempts.start(actor, params.id);
  }

  @Get('learn/attempts/:id')
  @RequirePermissions('student.learn')
  @ZodResponse(learnerAttemptSchema)
  attempt(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.attempts.get(actor, params.id);
  }

  @Put('learn/attempts/:id/responses/:itemId')
  @RequirePermissions('student.learn')
  @ZodResponse(savedResponseSchema)
  saveResponse(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(itemParamsSchema) params: ItemParams,
    @ZodBody(saveResponseRequestSchema) body: SaveResponseRequest,
  ) {
    return this.attempts.saveResponse(actor, params.id, params.itemId, body.response);
  }

  @Post('learn/attempts/:id/submit')
  @HttpCode(200)
  @RequirePermissions('student.learn')
  @ZodResponse(learnerAttemptSchema)
  submit(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.attempts.submit(actor, params.id);
  }

  // Authors and reviewers. Content roles are checked in the service, since any one will do.

  @Get('assessments')
  @Authenticated()
  @ZodResponse(z.array(assessmentViewSchema))
  list(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(listAssessmentsQuerySchema) query: ListAssessmentsQuery,
  ) {
    return this.authoring.list(actor, query.subjectId);
  }

  @Post('assessments')
  @RequirePermissions('content.create')
  @ZodResponse(assessmentViewSchema, 201)
  create(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createAssessmentRequestSchema) body: CreateAssessmentRequest,
  ) {
    return this.authoring.create(actor, body);
  }

  @Get('assessments/:id')
  @Authenticated()
  @ZodResponse(assessmentViewSchema)
  get(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.authoring.get(actor, params.id);
  }

  @Put('assessments/:id/draft')
  @RequirePermissions('content.edit')
  @ZodResponse(assessmentViewSchema)
  saveDraft(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(saveAssessmentDraftRequestSchema) body: SaveAssessmentDraftRequest,
  ) {
    return this.authoring.saveDraft(actor, params.id, body.content);
  }

  @Get('assessment-versions/review-queue')
  @Authenticated()
  @ZodResponse(z.array(assessmentViewSchema))
  reviewQueue(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(reviewQueueQuerySchema) query: ReviewQueueQuery,
  ) {
    return this.authoring.reviewQueue(actor, query.state);
  }

  @Post('assessment-versions/:id/transitions')
  @HttpCode(200)
  @Authenticated()
  @ZodResponse(assessmentVersionViewSchema)
  transition(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(contentTransitionRequestSchema) body: ContentTransitionRequest,
  ) {
    return this.authoring.transition(actor, params.id, body.action, body.reason);
  }
}
