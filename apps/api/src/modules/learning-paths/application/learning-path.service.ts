import { Injectable } from '@nestjs/common';
import {
  type ContentAction,
  type ContentState,
  type CreateLearningPathRequest,
  ERROR_CODES,
  type LearnerLessonSummary,
  type LearnerPath,
  type LearnerPathSummary,
  type LearningPathContent,
  learningPathContentSchema,
  learningPathLessonIds,
  type LearningPathVersionView,
  type LearningPathView,
  type ListLearningPathsQuery,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import { ContentTransitions } from '../../content/index.js';
import { CurriculumService } from '../../curriculum/index.js';
import { ProgressService } from '../../learning-progress/index.js';
import { LessonService } from '../../lessons/index.js';

const ITEM_TYPE = 'learning_path';
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

const pathInclude = { versions: { orderBy: { number: 'desc' as const } } };

const filterOf = (query: ListLearningPathsQuery) => ({
  ...(query.subjectId ? { subjectId: query.subjectId } : {}),
  ...(query.gradeLevelId ? { gradeLevelId: query.gradeLevelId } : {}),
});

/**
 * Authoring, review and delivery of learning paths: ordered units of lessons (ADR-014).
 * Lifecycle rules come from the content module, and lessons are reached through LessonService.
 */
@Injectable()
export class LearningPathService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
    private readonly transitions: ContentTransitions,
    private readonly curriculum: CurriculumService,
    private readonly lessons: LessonService,
    private readonly progress: ProgressService,
  ) {}

  async list(actor: TenantActor, query: ListLearningPathsQuery): Promise<LearningPathView[]> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const paths = await tx.learningPath.findMany({
        where: { archivedAt: null, ...filterOf(query) },
        include: pathInclude,
        orderBy: { createdAt: 'asc' },
      });
      return paths.map(toPathView);
    });
  }

  async get(actor: TenantActor, pathId: string): Promise<LearningPathView> {
    requireContentRole(actor);
    return this.database.run(scopeOf(actor), async (tx) => {
      const path = await tx.learningPath.findFirst({ where: { id: pathId }, include: pathInclude });
      if (!path) {
        throw AppError.notFound('Learning path not found');
      }
      return toPathView(path);
    });
  }

  async create(actor: TenantActor, request: CreateLearningPathRequest): Promise<LearningPathView> {
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
      await this.assertLessonsExist(tx, request.content);
      const path = await tx.learningPath.create({
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
        include: pathInclude,
      });
      await this.audit.record(tx, {
        action: 'learning_path.created',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'learning_path',
        targetId: path.id,
      });
      return toPathView(path);
    });
  }

  /** Same rules as lessons: the author's open draft, or a new version once one is live. */
  async saveDraft(
    actor: TenantActor,
    pathId: string,
    content: LearningPathContent,
  ): Promise<LearningPathView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const path = await tx.learningPath.findFirst({
        where: { id: pathId, tenantId: actor.tenantId },
        include: pathInclude,
      });
      if (!path) {
        throw AppError.notFound('Learning path not found');
      }
      await this.assertLessonsExist(tx, content);
      const open = path.versions.find((version) => OPEN_STATES.includes(version.state));
      if (open && open.state !== 'DRAFT') {
        throw AppError.conflict(
          ERROR_CODES.CONTENT_STATE_INVALID,
          'This learning path has a version in review. It must be approved, published or rejected first.',
        );
      }
      if (open) {
        if (open.authorId !== actor.userId) {
          throw AppError.forbidden('Only the author of this draft can edit it');
        }
        await tx.learningPathVersion.update({ where: { id: open.id }, data: { content } });
      } else {
        await tx.learningPathVersion.create({
          data: {
            tenantId: actor.tenantId,
            learningPathId: path.id,
            number: (path.versions[0]?.number ?? 0) + 1,
            content,
            authorId: actor.userId,
          },
        });
      }
      const saved = await tx.learningPath.findFirstOrThrow({
        where: { id: path.id },
        include: pathInclude,
      });
      return toPathView(saved);
    });
  }

  async reviewQueue(actor: TenantActor, state: ContentState): Promise<LearningPathView[]> {
    if (!actor.permissions.has('content.review') && !actor.permissions.has('content.publish')) {
      throw AppError.forbidden();
    }
    return this.database.run(scopeOf(actor), async (tx) => {
      const paths = await tx.learningPath.findMany({
        where: { tenantId: actor.tenantId, versions: { some: { state } } },
        include: pathInclude,
        orderBy: { createdAt: 'asc' },
      });
      return paths.map(toPathView);
    });
  }

  async transition(
    actor: TenantActor,
    versionId: string,
    action: ContentAction,
    reason?: string,
  ): Promise<LearningPathVersionView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const version = await tx.learningPathVersion.findFirst({
        where: { id: versionId, tenantId: actor.tenantId },
      });
      if (!version) {
        throw AppError.notFound('Learning path version not found');
      }
      const content = learningPathContentSchema.parse(version.content);
      await this.transitions.apply(
        tx,
        actor,
        {
          itemType: ITEM_TYPE,
          itemId: version.learningPathId,
          version,
          // A path goes to review, and goes live, only when every lesson in it is live.
          beforeStep: async (inner, step) => {
            if (step === 'submit' || step === 'approve' || step === 'publish') {
              await this.assertLessonsPublished(inner, content);
            }
          },
          retirePublished: async (inner) => {
            await inner.learningPathVersion.updateMany({
              where: { learningPathId: version.learningPathId, state: 'PUBLISHED' },
              data: { state: 'ARCHIVED' },
            });
          },
          writeStep: async (inner, from, data) =>
            (
              await inner.learningPathVersion.updateMany({
                where: { id: version.id, state: from },
                data,
              })
            ).count,
        },
        action,
        reason,
      );
      return toVersionView(
        await tx.learningPathVersion.findFirstOrThrow({ where: { id: version.id } }),
      );
    });
  }

  // -------------------------------------------------------------------------
  // Learners
  // -------------------------------------------------------------------------

  async listPublished(
    actor: TenantActor,
    query: ListLearningPathsQuery,
  ): Promise<LearnerPathSummary[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const versions = await tx.learningPathVersion.findMany({
        where: { state: 'PUBLISHED', learningPath: { archivedAt: null, ...filterOf(query) } },
        include: { learningPath: { select: { subjectId: true, gradeLevelId: true } } },
        orderBy: { publishedAt: 'asc' },
      });
      return versions.map((version) => {
        const content = learningPathContentSchema.parse(version.content);
        return {
          learningPathId: version.learningPathId,
          versionId: version.id,
          subjectId: version.learningPath.subjectId,
          gradeLevelId: version.learningPath.gradeLevelId,
          title: content.title,
          summary: content.summary ?? null,
          unitCount: content.units.length,
          lessonCount: learningPathLessonIds(content).length,
        };
      });
    });
  }

  /**
   * The live version of a path as a learner sees it, with each lesson's live version. A lesson
   * that has since been taken offline is left out, and so is a unit left with no lessons.
   */
  async learn(actor: TenantActor, pathId: string): Promise<LearnerPath> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const version = await tx.learningPathVersion.findFirst({
        where: { learningPathId: pathId, state: 'PUBLISHED', learningPath: { archivedAt: null } },
        include: { learningPath: { select: { subjectId: true, gradeLevelId: true } } },
      });
      if (!version) {
        throw AppError.notFound('Learning path not found');
      }
      const content = learningPathContentSchema.parse(version.content);
      const lessonIds = learningPathLessonIds(content);
      const live = await this.lessons.publishedSummaries(tx, lessonIds);
      const done = await this.progress.completedLessonIds(tx, actor.userId, lessonIds);
      // A lesson is locked while any live lesson before it in the path is unfinished.
      let unfinishedBefore = false;
      const withProgress = (lesson: LearnerLessonSummary) => {
        const completed = done.has(lesson.lessonId);
        const entry = { ...lesson, completed, locked: unfinishedBefore };
        unfinishedBefore ||= !completed;
        return entry;
      };
      return {
        learningPathId: version.learningPathId,
        versionId: version.id,
        subjectId: version.learningPath.subjectId,
        gradeLevelId: version.learningPath.gradeLevelId,
        title: content.title,
        summary: content.summary ?? null,
        units: content.units
          .map((unit) => ({
            id: unit.id,
            title: unit.title,
            summary: unit.summary ?? null,
            lessons: unit.lessonIds.flatMap((id) => {
              const lesson = live.get(id);
              return lesson ? [withProgress(lesson)] : [];
            }),
          }))
          .filter((unit) => unit.lessons.length > 0),
      };
    });
  }

  private async assertLessonsExist(tx: Tx, content: LearningPathContent): Promise<void> {
    const ids = learningPathLessonIds(content);
    const found = await this.lessons.publishedSummaries(tx, ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 404, 'A lesson in this path was not found', {
        lessonIds: missing,
      });
    }
  }

  private async assertLessonsPublished(tx: Tx, content: LearningPathContent): Promise<void> {
    const ids = learningPathLessonIds(content);
    const found = await this.lessons.publishedSummaries(tx, ids);
    const notLive = ids.filter((id) => !found.get(id));
    if (notLive.length > 0) {
      throw new AppError(
        ERROR_CODES.LESSON_NOT_PUBLISHED,
        409,
        'Every lesson in a learning path must be published first',
        { lessonIds: notLive },
      );
    }
  }
}

function requireContentRole(actor: TenantActor): void {
  const allowed = ['content.create', 'content.review', 'content.publish'] as const;
  if (!allowed.some((permission) => actor.permissions.has(permission))) {
    throw AppError.forbidden();
  }
}

function toVersionView(version: VersionRow): LearningPathVersionView {
  return {
    id: version.id,
    number: version.number,
    state: version.state,
    content: learningPathContentSchema.parse(version.content),
    authorId: version.authorId,
    reviewedBy: version.reviewedBy,
    reviewNote: version.reviewNote,
    submittedAt: version.submittedAt?.toISOString() ?? null,
    publishedAt: version.publishedAt?.toISOString() ?? null,
  };
}

function toPathView(path: {
  id: string;
  tenantId: string | null;
  subjectId: string;
  gradeLevelId: string | null;
  versions: VersionRow[];
}): LearningPathView {
  return {
    id: path.id,
    subjectId: path.subjectId,
    gradeLevelId: path.gradeLevelId,
    scope: path.tenantId ? 'TENANT' : 'GLOBAL',
    versions: path.versions.map(toVersionView),
  };
}
