import { Injectable } from '@nestjs/common';
import {
  type ContentAction,
  type ContentState,
  type AssessmentContent,
  assessmentContentSchema,
  type AssessmentVersionView,
  type AssessmentView,
  type CreateAssessmentRequest,
  ERROR_CODES,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import { ContentTransitions } from '../../content/index.js';
import { CurriculumService } from '../../curriculum/index.js';
import { QuestionService } from '../../questions/index.js';

const ITEM_TYPE = 'assessment';
const OPEN_STATES: ContentState[] = ['DRAFT', 'IN_REVIEW', 'APPROVED'];
const scopeOf = (actor: TenantActor) => ({ tenantId: actor.tenantId, userId: actor.userId });

type VersionRow = {
  id: string;
  number: number;
  state: ContentState;
  content: unknown;
  authorId: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: Date | null;
  publishedAt: Date | null;
};

const assessmentInclude = { versions: { orderBy: { number: 'desc' as const } } };

/** Authoring and review of assessments. Lifecycle rules come from the content module. */
@Injectable()
export class AssessmentAuthoringService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly transitions: ContentTransitions,
    private readonly curriculum: CurriculumService,
    private readonly questions: QuestionService,
  ) {}

  async list(actor: TenantActor, subjectId?: string): Promise<AssessmentView[]> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const assessments = await tx.assessment.findMany({
        where: { archivedAt: null, ...(subjectId ? { subjectId } : {}) },
        include: assessmentInclude,
        orderBy: { createdAt: 'asc' },
      });
      return assessments.map(toAssessmentView);
    });
  }

  async get(actor: TenantActor, assessmentId: string): Promise<AssessmentView> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId },
        include: assessmentInclude,
      });
      if (!assessment) {
        throw AppError.notFound('Assessment not found');
      }
      return toAssessmentView(assessment);
    });
  }

  async create(actor: TenantActor, request: CreateAssessmentRequest): Promise<AssessmentView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      if (!(await this.curriculum.isSubjectVisible(tx, request.subjectId))) {
        throw AppError.notFound('Subject not found');
      }
      if (
        request.gradeLevelId &&
        !(await this.curriculum.isGradeLevelVisible(tx, request.gradeLevelId))
      ) {
        throw AppError.notFound('Grade level not found');
      }
      await this.assertQuestionsExist(tx, request.content);
      const assessment = await tx.assessment.create({
        data: {
          tenantId: actor.tenantId,
          subjectId: request.subjectId,
          gradeLevelId: request.gradeLevelId ?? null,
          createdBy: actor.userId,
          versions: {
            create: {
              tenantId: actor.tenantId,
              number: 1,
              content: request.content,
              authorId: actor.userId,
            },
          },
        },
        include: assessmentInclude,
      });
      await this.audit.record(tx, {
        action: 'assessment.created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'assessment',
        targetId: assessment.id,
      });
      return toAssessmentView(assessment);
    });
  }

  /** Same rules as lessons: the author's open draft, or a new version once one is live. */
  async saveDraft(
    actor: TenantActor,
    assessmentId: string,
    content: AssessmentContent,
  ): Promise<AssessmentView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const assessment = await tx.assessment.findFirst({
        where: { id: assessmentId, tenantId: actor.tenantId },
        include: assessmentInclude,
      });
      if (!assessment) {
        throw AppError.notFound('Assessment not found');
      }
      await this.assertQuestionsExist(tx, content);
      const open = assessment.versions.find((version) => OPEN_STATES.includes(version.state));
      if (open && open.state !== 'DRAFT') {
        throw AppError.conflict(
          ERROR_CODES.CONTENT_STATE_INVALID,
          'This assessment has a version in review. It must be approved, published or rejected first.',
        );
      }
      if (open) {
        if (open.authorId !== actor.userId) {
          throw AppError.forbidden('Only the author of this draft can edit it');
        }
        await tx.assessmentVersion.update({ where: { id: open.id }, data: { content } });
      } else {
        await tx.assessmentVersion.create({
          data: {
            tenantId: actor.tenantId,
            assessmentId: assessment.id,
            number: (assessment.versions[0]?.number ?? 0) + 1,
            content,
            authorId: actor.userId,
          },
        });
      }
      const saved = await tx.assessment.findFirstOrThrow({
        where: { id: assessment.id },
        include: assessmentInclude,
      });
      return toAssessmentView(saved);
    });
  }

  async reviewQueue(actor: TenantActor, state: ContentState): Promise<AssessmentView[]> {
    if (!actor.permissions.has('content.review') && !actor.permissions.has('content.publish')) {
      throw AppError.forbidden();
    }
    return this.database.run(scopeOf(actor), async (tx) => {
      const assessments = await tx.assessment.findMany({
        where: { tenantId: actor.tenantId, versions: { some: { state } } },
        include: assessmentInclude,
        orderBy: { createdAt: 'asc' },
      });
      return assessments.map(toAssessmentView);
    });
  }

  async transition(
    actor: TenantActor,
    versionId: string,
    action: ContentAction,
    reason?: string,
  ): Promise<AssessmentVersionView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const version = await tx.assessmentVersion.findFirst({
        where: { id: versionId, tenantId: actor.tenantId },
      });
      if (!version) {
        throw AppError.notFound('Assessment version not found');
      }
      const content = assessmentContentSchema.parse(version.content);
      await this.transitions.apply(
        tx,
        actor,
        {
          itemType: ITEM_TYPE,
          itemId: version.assessmentId,
          version,
          // An assessment goes to review, and goes live, only when every question in it is live.
          beforeStep: async (inner, step) => {
            if (step === 'submit' || step === 'approve' || step === 'publish') {
              await this.assertQuestionsPublished(inner, content);
            }
          },
          retirePublished: async (inner) => {
            await inner.assessmentVersion.updateMany({
              where: { assessmentId: version.assessmentId, state: 'PUBLISHED' },
              data: { state: 'ARCHIVED' },
            });
          },
          writeStep: async (inner, from, data) =>
            (
              await inner.assessmentVersion.updateMany({
                where: { id: version.id, state: from },
                data,
              })
            ).count,
        },
        action,
        reason,
      );
      return toVersionView(
        await tx.assessmentVersion.findFirstOrThrow({ where: { id: version.id } }),
      );
    });
  }

  private async assertQuestionsExist(tx: Tx, content: AssessmentContent): Promise<void> {
    const ids = questionVersionIds(content);
    const found = await this.questions.versionsByIds(tx, ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        404,
        'A question in this assessment was not found',
        {
          questionVersionIds: missing,
        },
      );
    }
  }

  private async assertQuestionsPublished(tx: Tx, content: AssessmentContent): Promise<void> {
    const ids = questionVersionIds(content);
    const found = await this.questions.versionsByIds(tx, ids);
    const notLive = ids.filter((id) => found.get(id)?.state !== 'PUBLISHED');
    if (notLive.length > 0) {
      throw new AppError(
        ERROR_CODES.QUESTION_NOT_PUBLISHED,
        409,
        'Every question in an assessment must be published first',
        { questionVersionIds: notLive },
      );
    }
  }
}

function questionVersionIds(content: AssessmentContent): string[] {
  return [...new Set(content.items.map((item) => item.questionVersionId))];
}

function requireContentRole(actor: TenantActor): void {
  const allowed = ['content.create', 'content.review', 'content.publish'] as const;
  if (!allowed.some((permission) => actor.permissions.has(permission))) {
    throw AppError.forbidden();
  }
}

function toVersionView(version: VersionRow): AssessmentVersionView {
  return {
    id: version.id,
    number: version.number,
    state: version.state,
    content: assessmentContentSchema.parse(version.content),
    authorId: version.authorId,
    reviewedBy: version.reviewedBy,
    reviewNote: version.reviewNote,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toAssessmentView(assessment: {
  id: string;
  tenantId: string | null;
  subjectId: string;
  gradeLevelId: string | null;
  versions: VersionRow[];
}): AssessmentView {
  return {
    id: assessment.id,
    subjectId: assessment.subjectId,
    gradeLevelId: assessment.gradeLevelId,
    scope: assessment.tenantId ? 'TENANT' : 'GLOBAL',
    versions: assessment.versions.map(toVersionView),
  };
}
