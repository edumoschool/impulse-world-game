import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type ContentTransitionRequest,
  contentTransitionRequestSchema,
  type CreateQuestionBankRequest,
  createQuestionBankRequestSchema,
  type CreateQuestionRequest,
  createQuestionRequestSchema,
  questionBankViewSchema,
  questionVersionViewSchema,
  questionViewSchema,
  type ReviewQueueQuery,
  reviewQueueQuerySchema,
  type SaveQuestionDraftRequest,
  saveQuestionDraftRequestSchema,
} from '@impulse/contracts';
import { z } from 'zod';
import {
  Authenticated,
  CurrentTenantActor,
  RateLimit,
  RequirePermissions,
} from '../../../common/decorators.js';
import type { TenantActor } from '../../../common/request-context.js';
import { ZodBody, ZodParams, ZodQuery, ZodResponse } from '../../../common/zod.js';
import { QuestionService } from '../application/question.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
type IdParams = z.infer<typeof idParamsSchema>;

/**
 * Authoring routes. Reads are open to anyone with a content role, which the service checks
 * because it accepts any one of several permissions. Lifecycle permissions are checked per step.
 */
@ApiTags('questions')
@Controller()
export class QuestionsController {
  constructor(private readonly questions: QuestionService) {}

  @Get('question-banks')
  @Authenticated()
  @ZodResponse(z.array(questionBankViewSchema))
  banks(@CurrentTenantActor() actor: TenantActor) {
    return this.questions.listBanks(actor);
  }

  @Post('question-banks')
  @RequirePermissions('content.create')
  @ZodResponse(questionBankViewSchema, 201)
  createBank(
    @CurrentTenantActor() actor: TenantActor,
    @ZodBody(createQuestionBankRequestSchema) body: CreateQuestionBankRequest,
  ) {
    return this.questions.createBank(actor, body);
  }

  @Get('question-banks/:id/questions')
  @Authenticated()
  @ZodResponse(z.array(questionViewSchema))
  bankQuestions(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
  ) {
    return this.questions.listQuestions(actor, params.id);
  }

  @Post('question-banks/:id/questions')
  @RequirePermissions('content.create')
  @RateLimit({ name: 'question-create', limit: 120, windowSeconds: 60 })
  @ZodResponse(questionViewSchema, 201)
  createQuestion(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(createQuestionRequestSchema) body: CreateQuestionRequest,
  ) {
    return this.questions.createQuestion(actor, params.id, body);
  }

  @Get('questions/:id')
  @Authenticated()
  @ZodResponse(questionViewSchema)
  question(@CurrentTenantActor() actor: TenantActor, @ZodParams(idParamsSchema) params: IdParams) {
    return this.questions.getQuestion(actor, params.id);
  }

  @Put('questions/:id/draft')
  @RequirePermissions('content.edit')
  @ZodResponse(questionViewSchema)
  saveDraft(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(saveQuestionDraftRequestSchema) body: SaveQuestionDraftRequest,
  ) {
    return this.questions.saveDraft(actor, params.id, body.definition);
  }

  @Get('question-versions/review-queue')
  @Authenticated()
  @ZodResponse(z.array(questionViewSchema))
  reviewQueue(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(reviewQueueQuerySchema) query: ReviewQueueQuery,
  ) {
    return this.questions.reviewQueue(actor, query.state);
  }

  @Post('question-versions/:id/transitions')
  @HttpCode(200)
  @Authenticated()
  @ZodResponse(questionVersionViewSchema)
  transition(
    @CurrentTenantActor() actor: TenantActor,
    @ZodParams(idParamsSchema) params: IdParams,
    @ZodBody(contentTransitionRequestSchema) body: ContentTransitionRequest,
  ) {
    return this.questions.transition(actor, params.id, body.action, body.reason);
  }
}
