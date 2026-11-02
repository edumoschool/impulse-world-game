import { Injectable } from '@nestjs/common';
import {
  type AssessmentContent,
  assessmentContentSchema,
  type AttemptResult,
  ERROR_CODES,
  type LearnerAssessmentSummary,
  type LearnerAttempt,
  type ListAssessmentsQuery,
  type QuestionDefinition,
  type QuestionResponse,
  questionResponseSchema,
  type SavedResponse,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../../infrastructure/events/outbox-writer.js';
import { evaluate, QuestionService, toLearnerQuestion } from '../../questions/index.js';
import { scoreAttempt } from '../domain/scoring.js';

const scopeOf = (actor: TenantActor) => ({ tenantId: actor.tenantId, userId: actor.userId });

type AttemptRow = {
  id: string;
  assessmentId: string;
  assessmentVersionId: string;
  state: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  earnedPoints: number | null;
  maxPoints: number | null;
  passed: boolean | null;
  pendingReview: number;
};

/**
 * A learner's attempts at an assessment. An attempt pins the assessment version it started on,
 * each response pins its question version, and only the server marks them (ADR-015). Learners
 * reach only their own attempts: RLS keeps tenants apart, and this service keeps learners apart.
 */
@Injectable()
export class AttemptService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly questions: QuestionService,
    private readonly outbox: OutboxWriter,
  ) {}

  async listPublished(
    actor: TenantActor,
    query: ListAssessmentsQuery,
  ): Promise<LearnerAssessmentSummary[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const versions = await tx.assessmentVersion.findMany({
        where: {
          state: 'PUBLISHED',
          assessment: {
            archivedAt: null,
            ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          },
        },
        include: { assessment: { select: { subjectId: true } } },
        orderBy: { publishedAt: 'asc' },
      });
      const used = await tx.assessmentAttempt.groupBy({
        by: ['assessmentId'],
        where: {
          learnerId: actor.userId,
          state: 'SUBMITTED',
          assessmentId: { in: versions.map((version) => version.assessmentId) },
        },
        _count: { _all: true },
      });
      const usedBy = new Map(used.map((row) => [row.assessmentId, row._count._all]));
      return versions.map((version) => {
        const content = assessmentContentSchema.parse(version.content);
        return {
          assessmentId: version.assessmentId,
          versionId: version.id,
          subjectId: version.assessment.subjectId,
          title: content.title,
          itemCount: content.items.length,
          maxAttempts: content.maxAttempts ?? null,
          attemptsUsed: usedBy.get(version.assessmentId) ?? 0,
        };
      });
    });
  }

  /**
   * Resumes the learner's open attempt, or starts one on the live version. Two taps at once
   * race on the one-open-attempt index, and the loser resumes the winner's attempt.
   */
  async start(actor: TenantActor, assessmentId: string): Promise<LearnerAttempt> {
    try {
      return await this.database.run(scopeOf(actor), (tx) => this.startIn(tx, actor, assessmentId));
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== 'P2002') {
        throw error;
      }
      return this.database.run(scopeOf(actor), (tx) => this.startIn(tx, actor, assessmentId));
    }
  }

  async get(actor: TenantActor, attemptId: string): Promise<LearnerAttempt> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const attempt = await tx.assessmentAttempt.findFirst({
        where: { id: attemptId, learnerId: actor.userId },
      });
      if (!attempt) {
        throw AppError.notFound('Attempt not found');
      }
      return this.view(tx, attempt);
    });
  }

  /** Saves or replaces one answer. Nothing is marked yet, so nothing about correctness leaks. */
  async saveResponse(
    actor: TenantActor,
    attemptId: string,
    itemId: string,
    response: QuestionResponse,
  ): Promise<SavedResponse> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const attempt = await this.lockOwnAttempt(tx, actor, attemptId);
      if (attempt.state !== 'IN_PROGRESS') {
        throw AppError.conflict(ERROR_CODES.ATTEMPT_CLOSED, 'This attempt has been submitted');
      }
      const { content, definitions } = await this.versionOf(tx, attempt.assessmentVersionId);
      const item = content.items.find((candidate) => candidate.id === itemId);
      if (!item) {
        throw AppError.notFound('Item not found');
      }
      if (definitionOf(definitions, item.questionVersionId).type !== response.type) {
        throw new AppError(
          ERROR_CODES.VALIDATION_FAILED,
          400,
          'This answer does not fit the question',
        );
      }
      const saved = await tx.assessmentResponse.upsert({
        where: { attemptId_itemId: { attemptId: attempt.id, itemId } },
        create: {
          tenantId: actor.tenantId,
          attemptId: attempt.id,
          itemId,
          questionVersionId: item.questionVersionId,
          response,
        },
        update: { response },
      });
      return { itemId, savedAt: saved.updatedAt.toISOString() };
    });
  }

  /**
   * Marks every item against its pinned question version, totals the attempt and closes it.
   * The scored attempt and its event commit together. Submitting again returns the result.
   */
  async submit(actor: TenantActor, attemptId: string): Promise<LearnerAttempt> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const locked = await this.lockOwnAttempt(tx, actor, attemptId);
      if (locked.state === 'SUBMITTED') {
        return this.view(
          tx,
          await tx.assessmentAttempt.findFirstOrThrow({ where: { id: locked.id } }),
        );
      }
      const { content, definitions } = await this.versionOf(tx, locked.assessmentVersionId);
      const saved = await tx.assessmentResponse.findMany({ where: { attemptId: locked.id } });
      const savedBy = new Map(saved.map((row) => [row.itemId, row]));

      const marked = content.items.map((item) => {
        const row = savedBy.get(item.id);
        const response = row?.response ? questionResponseSchema.parse(row.response) : null;
        return {
          id: item.id,
          points: item.points,
          evaluation: response
            ? evaluate(definitionOf(definitions, item.questionVersionId), response)
            : null,
        };
      });
      const result = scoreAttempt(marked, content.passingScore);

      // Responses are written first: the database refuses any change once the attempt closes.
      for (const item of result.items) {
        const row = savedBy.get(item.itemId);
        if (row) {
          await tx.assessmentResponse.update({
            where: { id: row.id },
            data: { outcome: item.outcome, score: item.score },
          });
        }
      }
      const unanswered = content.items.filter((item) => !savedBy.has(item.id));
      if (unanswered.length > 0) {
        await tx.assessmentResponse.createMany({
          data: unanswered.map((item) => ({
            tenantId: actor.tenantId,
            attemptId: locked.id,
            itemId: item.id,
            questionVersionId: item.questionVersionId,
            outcome: 'UNANSWERED' as const,
            score: 0,
          })),
        });
      }
      const closed = await tx.assessmentAttempt.updateMany({
        where: { id: locked.id, state: 'IN_PROGRESS' },
        data: {
          state: 'SUBMITTED',
          submittedAt: new Date(),
          score: result.score,
          earnedPoints: result.earnedPoints,
          maxPoints: result.maxPoints,
          passed: result.passed,
          pendingReview: result.pendingReview,
        },
      });
      // The row lock makes this unreachable, unless the lock is ever removed.
      if (closed.count !== 1) {
        throw AppError.conflict(ERROR_CODES.ATTEMPT_CLOSED, 'This attempt has been submitted');
      }
      await this.outbox.append(tx, {
        type: 'assessment.submitted',
        aggregateId: locked.id,
        tenantId: actor.tenantId,
        payload: {
          attemptId: locked.id,
          assessmentId: locked.assessmentId,
          assessmentVersionId: locked.assessmentVersionId,
          learnerId: actor.userId,
          score: result.score,
          passed: result.passed,
        },
      });
      return this.view(
        tx,
        await tx.assessmentAttempt.findFirstOrThrow({ where: { id: locked.id } }),
      );
    });
  }

  private async startIn(tx: Tx, actor: TenantActor, assessmentId: string): Promise<LearnerAttempt> {
    const open = await tx.assessmentAttempt.findFirst({
      where: { assessmentId, learnerId: actor.userId, state: 'IN_PROGRESS' },
    });
    if (open) {
      return this.view(tx, open);
    }
    const version = await tx.assessmentVersion.findFirst({
      where: { assessmentId, state: 'PUBLISHED', assessment: { archivedAt: null } },
    });
    if (!version) {
      throw AppError.notFound('Assessment not found');
    }
    const content = assessmentContentSchema.parse(version.content);
    if (content.maxAttempts !== undefined) {
      const used = await tx.assessmentAttempt.count({
        where: { assessmentId, learnerId: actor.userId, state: 'SUBMITTED' },
      });
      if (used >= content.maxAttempts) {
        throw AppError.conflict(
          ERROR_CODES.ATTEMPT_LIMIT_REACHED,
          'There are no attempts left for this assessment',
        );
      }
    }
    const attempt = await tx.assessmentAttempt.create({
      data: {
        tenantId: actor.tenantId,
        assessmentId,
        assessmentVersionId: version.id,
        learnerId: actor.userId,
      },
    });
    return this.view(tx, attempt);
  }

  /**
   * Locks the attempt row for the rest of the transaction, so a save and a submit never
   * interleave. Another learner's attempt reads as not found.
   */
  private async lockOwnAttempt(tx: Tx, actor: TenantActor, attemptId: string) {
    const rows = await tx.$queryRaw<
      {
        id: string;
        assessment_id: string;
        assessment_version_id: string;
        state: 'IN_PROGRESS' | 'SUBMITTED';
      }[]
    >`SELECT id, assessment_id, assessment_version_id, state::text AS state
      FROM assessment_attempts
      WHERE id = ${attemptId}::uuid AND learner_id = ${actor.userId}::uuid
      FOR UPDATE`;
    const row = rows[0];
    if (!row) {
      throw AppError.notFound('Attempt not found');
    }
    return {
      id: row.id,
      assessmentId: row.assessment_id,
      assessmentVersionId: row.assessment_version_id,
      state: row.state,
    };
  }

  private async versionOf(tx: Tx, versionId: string) {
    const version = await tx.assessmentVersion.findUniqueOrThrow({ where: { id: versionId } });
    const content = assessmentContentSchema.parse(version.content);
    const definitions = await this.questions.versionsByIds(
      tx,
      content.items.map((item) => item.questionVersionId),
    );
    return { content, definitions };
  }

  private async view(tx: Tx, attempt: AttemptRow): Promise<LearnerAttempt> {
    const { content, definitions } = await this.versionOf(tx, attempt.assessmentVersionId);
    const responses = await tx.assessmentResponse.findMany({ where: { attemptId: attempt.id } });
    const responseBy = new Map(responses.map((row) => [row.itemId, row]));
    return {
      attemptId: attempt.id,
      assessmentId: attempt.assessmentId,
      versionId: attempt.assessmentVersionId,
      title: content.title,
      instructions: content.instructions ?? null,
      state: attempt.state,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      items: content.items.map((item) => {
        const saved = responseBy.get(item.id)?.response;
        return {
          id: item.id,
          points: item.points,
          questionVersionId: item.questionVersionId,
          question: toLearnerQuestion(
            definitionOf(definitions, item.questionVersionId),
            `${attempt.id}:${item.id}`,
          ),
          response: saved ? questionResponseSchema.parse(saved) : null,
        };
      }),
      result: resultOf(attempt, content, responseBy),
    };
  }
}

function definitionOf(
  definitions: Map<string, { definition: QuestionDefinition }>,
  questionVersionId: string,
): QuestionDefinition {
  const found = definitions.get(questionVersionId);
  // Publishing checked every question, and versions are never deleted, so this is corruption.
  if (!found) {
    throw new Error(`Assessment names a missing question version ${questionVersionId}`);
  }
  return found.definition;
}

function resultOf(
  attempt: AttemptRow,
  content: AssessmentContent,
  responses: Map<
    string,
    { outcome: AttemptResult['items'][number]['outcome'] | null; score: number | null }
  >,
): AttemptResult | null {
  if (attempt.state !== 'SUBMITTED' || attempt.maxPoints === null) {
    return null;
  }
  return {
    score: attempt.score ?? 0,
    earnedPoints: attempt.earnedPoints ?? 0,
    maxPoints: attempt.maxPoints,
    passed: attempt.passed,
    pendingReview: attempt.pendingReview,
    items: content.items.map((item) => {
      const row = responses.get(item.id);
      return {
        itemId: item.id,
        outcome: row?.outcome ?? 'UNANSWERED',
        score: row?.score ?? null,
      };
    }),
  };
}
