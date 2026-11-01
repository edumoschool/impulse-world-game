import { Injectable } from '@nestjs/common';
import {
  type ContentAction,
  type ContentState,
  type CreateLessonRequest,
  ERROR_CODES,
  type LearnerLesson,
  type LearnerLessonSummary,
  type LessonContent,
  lessonContentSchema,
  type LessonVersionView,
  type LessonView,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import { ContentTransitions } from '../../content/index.js';
import { CurriculumService } from '../../curriculum/index.js';
import { QuestionService, toLearnerQuestion } from '../../questions/index.js';

const ITEM_TYPE = 'lesson';
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

const lessonInclude = { versions: { orderBy: { number: 'desc' as const } } };

/** Authoring, review and delivery of lessons. Lifecycle rules come from the content module. */
@Injectable()
export class LessonService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly transitions: ContentTransitions,
    private readonly curriculum: CurriculumService,
    private readonly questions: QuestionService,
  ) {}

  async list(actor: TenantActor, subjectId?: string): Promise<LessonView[]> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const lessons = await tx.lesson.findMany({
        where: { archivedAt: null, ...(subjectId ? { subjectId } : {}) },
        include: lessonInclude,
        orderBy: { createdAt: 'asc' },
      });
      return lessons.map(toLessonView);
    });
  }

  async get(actor: TenantActor, lessonId: string): Promise<LessonView> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const lesson = await tx.lesson.findFirst({ where: { id: lessonId }, include: lessonInclude });
      if (!lesson) {
        throw AppError.notFound('Lesson not found');
      }
      return toLessonView(lesson);
    });
  }

  async create(actor: TenantActor, request: CreateLessonRequest): Promise<LessonView> {
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
      const lesson = await tx.lesson.create({
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
        include: lessonInclude,
      });
      await this.audit.record(tx, {
        action: 'lesson.created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'lesson',
        targetId: lesson.id,
      });
      return toLessonView(lesson);
    });
  }

  /** Same rules as questions: the author's open draft, or a new version once one is live. */
  async saveDraft(
    actor: TenantActor,
    lessonId: string,
    content: LessonContent,
  ): Promise<LessonView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, tenantId: actor.tenantId },
        include: lessonInclude,
      });
      if (!lesson) {
        throw AppError.notFound('Lesson not found');
      }
      await this.assertQuestionsExist(tx, content);
      const open = lesson.versions.find((version) => OPEN_STATES.includes(version.state));
      if (open && open.state !== 'DRAFT') {
        throw AppError.conflict(
          ERROR_CODES.CONTENT_STATE_INVALID,
          'This lesson has a version in review. It must be approved, published or rejected first.',
        );
      }
      if (open) {
        if (open.authorId !== actor.userId) {
          throw AppError.forbidden('Only the author of this draft can edit it');
        }
        await tx.lessonVersion.update({ where: { id: open.id }, data: { content } });
      } else {
        await tx.lessonVersion.create({
          data: {
            tenantId: actor.tenantId,
            lessonId: lesson.id,
            number: (lesson.versions[0]?.number ?? 0) + 1,
            content,
            authorId: actor.userId,
          },
        });
      }
      const saved = await tx.lesson.findFirstOrThrow({
        where: { id: lesson.id },
        include: lessonInclude,
      });
      return toLessonView(saved);
    });
  }

  async reviewQueue(actor: TenantActor, state: ContentState): Promise<LessonView[]> {
    if (!actor.permissions.has('content.review') && !actor.permissions.has('content.publish')) {
      throw AppError.forbidden();
    }
    return this.database.run(scopeOf(actor), async (tx) => {
      const lessons = await tx.lesson.findMany({
        where: { tenantId: actor.tenantId, versions: { some: { state } } },
        include: lessonInclude,
        orderBy: { createdAt: 'asc' },
      });
      return lessons.map(toLessonView);
    });
  }

  async transition(
    actor: TenantActor,
    versionId: string,
    action: ContentAction,
    reason?: string,
  ): Promise<LessonVersionView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const version = await tx.lessonVersion.findFirst({
        where: { id: versionId, tenantId: actor.tenantId },
      });
      if (!version) {
        throw AppError.notFound('Lesson version not found');
      }
      const content = lessonContentSchema.parse(version.content);
      await this.transitions.apply(
        tx,
        actor,
        {
          itemType: ITEM_TYPE,
          itemId: version.lessonId,
          version,
          // A lesson goes to review, and goes live, only when every question in it is live.
          beforeStep: async (inner, step) => {
            if (step === 'submit' || step === 'approve' || step === 'publish') {
              await this.assertQuestionsPublished(inner, content);
            }
          },
          retirePublished: async (inner) => {
            await inner.lessonVersion.updateMany({
              where: { lessonId: version.lessonId, state: 'PUBLISHED' },
              data: { state: 'ARCHIVED' },
            });
          },
          writeStep: async (inner, from, data) =>
            (
              await inner.lessonVersion.updateMany({
                where: { id: version.id, state: from },
                data,
              })
            ).count,
        },
        action,
        reason,
      );
      return toVersionView(await tx.lessonVersion.findFirstOrThrow({ where: { id: version.id } }));
    });
  }

  // -------------------------------------------------------------------------
  // Learners
  // -------------------------------------------------------------------------

  async listPublished(actor: TenantActor, subjectId?: string): Promise<LearnerLessonSummary[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const versions = await tx.lessonVersion.findMany({
        where: {
          state: 'PUBLISHED',
          lesson: { archivedAt: null, ...(subjectId ? { subjectId } : {}) },
        },
        include: { lesson: { select: { subjectId: true } } },
        orderBy: { publishedAt: 'asc' },
      });
      return versions.map((version) => {
        const content = lessonContentSchema.parse(version.content);
        return {
          lessonId: version.lessonId,
          versionId: version.id,
          subjectId: version.lesson.subjectId,
          title: content.title,
          summary: content.summary ?? null,
          estimatedMinutes: content.estimatedMinutes,
        };
      });
    });
  }

  /**
   * The live version of a lesson as a learner sees it. Question blocks carry the pinned question
   * version without its answer key, shuffled per learner so the order stays put on reload.
   */
  async learn(actor: TenantActor, lessonId: string): Promise<LearnerLesson> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const version = await tx.lessonVersion.findFirst({
        where: { lessonId, state: 'PUBLISHED', lesson: { archivedAt: null } },
        include: { lesson: { select: { subjectId: true } } },
      });
      if (!version) {
        throw AppError.notFound('Lesson not found');
      }
      const content = lessonContentSchema.parse(version.content);
      const questionIds = questionVersionIds(content);
      const questions = await this.questions.versionsByIds(tx, questionIds);
      return {
        lessonId: version.lessonId,
        versionId: version.id,
        subjectId: version.lesson.subjectId,
        title: content.title,
        summary: content.summary ?? null,
        estimatedMinutes: content.estimatedMinutes,
        blocks: content.blocks.map((block) => {
          if (block.type !== 'QUESTION') {
            return block;
          }
          const pinned = questions.get(block.questionVersionId);
          // Publishing checked this, and versions are never deleted, so this means corruption.
          if (!pinned) {
            throw new Error(`Lesson ${version.id} names a missing question version`);
          }
          return {
            ...block,
            question: toLearnerQuestion(pinned.definition, `${version.id}:${actor.userId}`),
          };
        }),
      };
    });
  }

  private async assertQuestionsExist(tx: Tx, content: LessonContent): Promise<void> {
    const ids = questionVersionIds(content);
    const found = await this.questions.versionsByIds(tx, ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'A question in this lesson was not found', {
        questionVersionIds: missing,
      });
    }
  }

  private async assertQuestionsPublished(tx: Tx, content: LessonContent): Promise<void> {
    const ids = questionVersionIds(content);
    const found = await this.questions.versionsByIds(tx, ids);
    const notLive = ids.filter((id) => found.get(id)?.state !== 'PUBLISHED');
    if (notLive.length > 0) {
      throw new AppError(
        ERROR_CODES.QUESTION_NOT_PUBLISHED,
        409,
        'Every question in a lesson must be published first',
        { questionVersionIds: notLive },
      );
    }
  }
}

function questionVersionIds(content: LessonContent): string[] {
  return [
    ...new Set(
      content.blocks.flatMap((block) =>
        block.type === 'QUESTION' ? [block.questionVersionId] : [],
      ),
    ),
  ];
}

function requireContentRole(actor: TenantActor): void {
  const allowed = ['content.create', 'content.review', 'content.publish'] as const;
  if (!allowed.some((permission) => actor.permissions.has(permission))) {
    throw AppError.forbidden();
  }
}

function toVersionView(version: VersionRow): LessonVersionView {
  return {
    id: version.id,
    number: version.number,
    state: version.state,
    content: lessonContentSchema.parse(version.content),
    authorId: version.authorId,
    reviewedBy: version.reviewedBy,
    reviewNote: version.reviewNote,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toLessonView(lesson: {
  id: string;
  tenantId: string | null;
  subjectId: string;
  gradeLevelId: string | null;
  versions: VersionRow[];
}): LessonView {
  return {
    id: lesson.id,
    subjectId: lesson.subjectId,
    gradeLevelId: lesson.gradeLevelId,
    scope: lesson.tenantId ? 'TENANT' : 'GLOBAL',
    versions: lesson.versions.map(toVersionView),
  };
}
