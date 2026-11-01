import { Injectable } from '@nestjs/common';
import {
  type ContentAction,
  type ContentState,
  type CreateQuestionBankRequest,
  type CreateQuestionRequest,
  ERROR_CODES,
  type LocalizedText,
  type QuestionBankView,
  type QuestionDefinition,
  questionDefinitionSchema,
  type QuestionVersionView,
  type QuestionView,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import { ContentTransitions } from '../../content/index.js';
import { CurriculumService } from '../../curriculum/index.js';
import { definitionProblems } from '../domain/definition.js';

const ITEM_TYPE = 'question';
const OPEN_STATES: ContentState[] = ['DRAFT', 'IN_REVIEW', 'APPROVED'];
const scopeOf = (actor: TenantActor) => ({ tenantId: actor.tenantId, userId: actor.userId });

type VersionRow = {
  id: string;
  number: number;
  state: ContentState;
  definition: unknown;
  authorId: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
};

/**
 * Authoring and review of questions (ADR-013). Every lifecycle step goes through the shared
 * state machine, and the database refuses edits to anything that has left DRAFT.
 */
@Injectable()
export class QuestionService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly transitions: ContentTransitions,
    private readonly curriculum: CurriculumService,
  ) {}

  async listBanks(actor: TenantActor): Promise<QuestionBankView[]> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const banks = await tx.questionBank.findMany({
        where: { archivedAt: null },
        include: { _count: { select: { questions: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return banks.map((bank) => ({
        id: bank.id,
        subjectId: bank.subjectId,
        title: bank.title as LocalizedText,
        scope: bank.tenantId ? ('TENANT' as const) : ('GLOBAL' as const),
        questionCount: bank._count.questions,
      }));
    });
  }

  async createBank(actor: TenantActor, request: CreateQuestionBankRequest) {
    return this.database.run(scopeOf(actor), async (tx) => {
      // Under RLS, so only a global or own-tenant subject can be used.
      if (!(await this.curriculum.isSubjectVisible(tx, request.subjectId))) {
        throw AppError.notFound('Subject not found');
      }
      const bank = await tx.questionBank.create({
        data: {
          tenantId: actor.tenantId,
          subjectId: request.subjectId,
          title: request.title,
          createdBy: actor.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'questions.bank_created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'question_bank',
        targetId: bank.id,
      });
      return {
        id: bank.id,
        subjectId: bank.subjectId,
        title: bank.title as LocalizedText,
        scope: 'TENANT' as const,
        questionCount: 0,
      };
    });
  }

  async listQuestions(actor: TenantActor, bankId: string): Promise<QuestionView[]> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const bank = await tx.questionBank.findFirst({ where: { id: bankId } });
      if (!bank) {
        throw AppError.notFound('Question bank not found');
      }
      const questions = await tx.question.findMany({
        where: { bankId },
        include: questionInclude,
        orderBy: { createdAt: 'asc' },
      });
      return questions.map(toQuestionView);
    });
  }

  async getQuestion(actor: TenantActor, questionId: string): Promise<QuestionView> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const question = await tx.question.findFirst({
        where: { id: questionId },
        include: questionInclude,
      });
      if (!question) {
        throw AppError.notFound('Question not found');
      }
      return toQuestionView(question);
    });
  }

  async createQuestion(
    actor: TenantActor,
    bankId: string,
    request: CreateQuestionRequest,
  ): Promise<QuestionView> {
    assertAnswerable(request.definition);
    return this.database.run(scopeOf(actor), async (tx) => {
      // Only the tenant's own banks take new questions; a global bank reads as not found.
      const bank = await tx.questionBank.findFirst({
        where: { id: bankId, tenantId: actor.tenantId, archivedAt: null },
      });
      if (!bank) {
        throw AppError.notFound('Question bank not found');
      }
      if (!(await this.curriculum.areSkillsVisible(tx, request.skillIds))) {
        throw AppError.notFound('Skill not found');
      }
      const question = await tx.question.create({
        data: {
          tenantId: actor.tenantId,
          bankId: bank.id,
          type: request.definition.type,
          createdBy: actor.userId,
          versions: {
            create: {
              tenantId: actor.tenantId,
              number: 1,
              definition: request.definition,
              authorId: actor.userId,
            },
          },
          skills: {
            create: request.skillIds.map((skillId) => ({ tenantId: actor.tenantId, skillId })),
          },
        },
        include: questionInclude,
      });
      await this.audit.record(tx, {
        action: 'questions.question_created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'question',
        targetId: question.id,
        metadata: { type: question.type },
      });
      return toQuestionView(question);
    });
  }

  /**
   * Saves the open draft, or starts the next version when nothing is in progress. Only the
   * draft's author may edit it, so nobody can edit a draft and then review it as someone else's.
   */
  async saveDraft(
    actor: TenantActor,
    questionId: string,
    definition: QuestionDefinition,
  ): Promise<QuestionView> {
    assertAnswerable(definition);
    return this.database.run(scopeOf(actor), async (tx) => {
      const question = await tx.question.findFirst({
        where: { id: questionId, tenantId: actor.tenantId },
        include: { versions: { orderBy: { number: 'desc' } } },
      });
      if (!question) {
        throw AppError.notFound('Question not found');
      }
      if (definition.type !== question.type) {
        throw new AppError(
          ERROR_CODES.DEFINITION_INVALID,
          400,
          'A question cannot change type. Create a new question instead.',
        );
      }
      const open = question.versions.find((version) => OPEN_STATES.includes(version.state));
      if (open && open.state !== 'DRAFT') {
        throw AppError.conflict(
          ERROR_CODES.CONTENT_STATE_INVALID,
          'This question has a version in review. It must be approved, published or rejected first.',
        );
      }
      if (open) {
        if (open.authorId !== actor.userId) {
          throw AppError.forbidden('Only the author of this draft can edit it');
        }
        await tx.questionVersion.update({ where: { id: open.id }, data: { definition } });
      } else {
        await tx.questionVersion.create({
          data: {
            tenantId: actor.tenantId,
            questionId: question.id,
            number: (question.versions[0]?.number ?? 0) + 1,
            definition,
            authorId: actor.userId,
          },
        });
      }
      const saved = await tx.question.findFirstOrThrow({
        where: { id: question.id },
        include: questionInclude,
      });
      return toQuestionView(saved);
    });
  }

  async reviewQueue(actor: TenantActor, state: ContentState): Promise<QuestionView[]> {
    if (!actor.permissions.has('content.review') && !actor.permissions.has('content.publish')) {
      throw AppError.forbidden();
    }
    return this.database.run(scopeOf(actor), async (tx) => {
      const questions = await tx.question.findMany({
        where: { tenantId: actor.tenantId, versions: { some: { state } } },
        include: questionInclude,
        orderBy: { createdAt: 'asc' },
      });
      return questions.map(toQuestionView);
    });
  }

  /**
   * For other modules, inside their transaction: the question versions with these ids that are
   * visible here (global or own tenant), with their state and definition. RLS decides visibility.
   */
  async versionsByIds(
    tx: Tx,
    versionIds: readonly string[],
  ): Promise<Map<string, { state: ContentState; definition: QuestionDefinition }>> {
    if (versionIds.length === 0) {
      return new Map();
    }
    const rows = await tx.questionVersion.findMany({
      where: { id: { in: [...versionIds] } },
      select: { id: true, state: true, definition: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { state: row.state, definition: questionDefinitionSchema.parse(row.definition) },
      ]),
    );
  }

  async transition(
    actor: TenantActor,
    versionId: string,
    action: ContentAction,
    reason?: string,
  ): Promise<QuestionVersionView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      // Global versions belong to the platform and read as not found for tenant reviewers.
      const version = await tx.questionVersion.findFirst({
        where: { id: versionId, tenantId: actor.tenantId },
      });
      if (!version) {
        throw AppError.notFound('Question version not found');
      }
      await this.transitions.apply(
        tx,
        actor,
        {
          itemType: ITEM_TYPE,
          itemId: version.questionId,
          version,
          retirePublished: async (inner) => {
            await inner.questionVersion.updateMany({
              where: { questionId: version.questionId, state: 'PUBLISHED' },
              data: { state: 'ARCHIVED' },
            });
          },
          writeStep: async (inner, from, data) =>
            (
              await inner.questionVersion.updateMany({
                where: { id: version.id, state: from },
                data,
              })
            ).count,
        },
        action,
        reason,
      );
      const updated = await tx.questionVersion.findFirstOrThrow({ where: { id: version.id } });
      return toVersionView(updated);
    });
  }
}

const questionInclude = {
  versions: { orderBy: { number: 'desc' as const } },
  skills: { select: { skillId: true } },
};

/** Authors, reviewers and publishers can see authoring data. Learners never get answer keys here. */
function requireContentRole(actor: TenantActor): void {
  const allowed = ['content.create', 'content.review', 'content.publish'] as const;
  if (!allowed.some((permission) => actor.permissions.has(permission))) {
    throw AppError.forbidden();
  }
}

function assertAnswerable(definition: QuestionDefinition): void {
  const problems = definitionProblems(definition);
  if (problems.length > 0) {
    throw new AppError(
      ERROR_CODES.DEFINITION_INVALID,
      400,
      'The answer key does not fit the question',
      { problems },
    );
  }
}

function toVersionView(version: VersionRow): QuestionVersionView {
  return {
    id: version.id,
    number: version.number,
    state: version.state,
    definition: questionDefinitionSchema.parse(version.definition),
    authorId: version.authorId,
    reviewedBy: version.reviewedBy,
    reviewNote: version.reviewNote,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toQuestionView(question: {
  id: string;
  tenantId: string | null;
  bankId: string;
  type: QuestionDefinition['type'];
  versions: VersionRow[];
  skills: { skillId: string }[];
}): QuestionView {
  return {
    id: question.id,
    bankId: question.bankId,
    type: question.type,
    skillIds: question.skills.map((skill) => skill.skillId),
    scope: question.tenantId ? 'TENANT' : 'GLOBAL',
    versions: question.versions.map(toVersionView),
  };
}
