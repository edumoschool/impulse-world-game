import { Injectable } from '@nestjs/common';
import type { LearnerProgress, LessonCompletionView } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { OutboxWriter } from '../../../infrastructure/events/outbox-writer.js';
import type { MarkedAttempt } from '../../assessments/index.js';
import { ChildService } from '../../children/index.js';
import { LessonService } from '../../lessons/index.js';
import { QuestionService } from '../../questions/index.js';
import { assessMastery, DEFAULT_MASTERY_MODEL } from '../domain/mastery.js';

const scopeOf = (actor: TenantActor) => ({ tenantId: actor.tenantId, userId: actor.userId });

/** Outcomes that say something about a skill. Skipped and unmarked items say nothing yet. */
const EVIDENCE_OUTCOMES = new Set(['CORRECT', 'PARTIAL', 'INCORRECT']);

/**
 * A learner's progress: lessons finished, and skill mastery derived from scored evidence
 * (ADR-016). Completion is recorded on the learner's word; mastery only ever comes from items
 * the server marked.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly outbox: OutboxWriter,
    private readonly lessons: LessonService,
    private readonly questions: QuestionService,
    private readonly children: ChildService,
  ) {}

  /** Records that the learner finished the live version of a lesson. Repeating it is harmless. */
  async completeLesson(actor: TenantActor, lessonId: string): Promise<LessonCompletionView> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const live = (await this.lessons.publishedSummaries(tx, [lessonId])).get(lessonId);
      if (!live) {
        throw AppError.notFound('Lesson not found');
      }
      // ON CONFLICT DO NOTHING, so a double tap records one completion and one event.
      const created = await tx.lessonCompletion.createMany({
        data: [
          {
            tenantId: actor.tenantId,
            learnerId: actor.userId,
            lessonId,
            lessonVersionId: live.versionId,
          },
        ],
        skipDuplicates: true,
      });
      const completion = await tx.lessonCompletion.findUniqueOrThrow({
        where: {
          learnerId_lessonVersionId: { learnerId: actor.userId, lessonVersionId: live.versionId },
        },
      });
      if (created.count === 1) {
        await this.outbox.append(tx, {
          type: 'lesson.completed',
          aggregateId: completion.id,
          tenantId: actor.tenantId,
          payload: {
            completionId: completion.id,
            lessonId,
            lessonVersionId: live.versionId,
            learnerId: actor.userId,
          },
        });
      }
      return toCompletionView(completion);
    });
  }

  async myProgress(actor: TenantActor): Promise<LearnerProgress> {
    return this.database.run(scopeOf(actor), (tx) => this.progressOf(tx, actor.userId));
  }

  /** A child's progress, for whoever may view the child: guardians, and staff who see all. */
  async childProgress(actor: TenantActor, childId: string): Promise<LearnerProgress> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const learnerId = await this.children.viewableChildUserId(tx, actor, childId);
      return this.progressOf(tx, learnerId);
    });
  }

  /** For other modules: which of these lessons the learner has finished, on any version. */
  async completedLessonIds(
    tx: Tx,
    learnerId: string,
    lessonIds: readonly string[],
  ): Promise<Set<string>> {
    if (lessonIds.length === 0) {
      return new Set();
    }
    const rows = await tx.lessonCompletion.findMany({
      where: { learnerId, lessonId: { in: [...lessonIds] } },
      select: { lessonId: true },
      distinct: ['lessonId'],
    });
    return new Set(rows.map((row) => row.lessonId));
  }

  /**
   * Turns a marked attempt into skill observations, then recomputes mastery for each skill it
   * touched. Runs inside the event consumer's transaction, so it applies exactly once.
   */
  async recordAttemptEvidence(tx: Tx, tenantId: string, attempt: MarkedAttempt): Promise<number> {
    const scored = attempt.items.filter(
      (item) => item.score !== null && EVIDENCE_OUTCOMES.has(item.outcome),
    );
    const skills = await this.questions.skillsByVersionIds(
      tx,
      scored.map((item) => item.questionVersionId),
    );
    const rows = scored.flatMap((item) =>
      (skills.get(item.questionVersionId) ?? []).map((skillId) => ({
        tenantId,
        learnerId: attempt.learnerId,
        skillId,
        sourceId: attempt.attemptId,
        sourceItem: item.responseId,
        score: item.score as number,
        observedAt: attempt.submittedAt,
      })),
    );
    if (rows.length === 0) {
      return 0;
    }
    await tx.skillObservation.createMany({ data: rows, skipDuplicates: true });
    for (const skillId of new Set(rows.map((row) => row.skillId))) {
      await this.recomputeMastery(tx, tenantId, attempt.learnerId, skillId);
    }
    return rows.length;
  }

  private async recomputeMastery(
    tx: Tx,
    tenantId: string,
    learnerId: string,
    skillId: string,
  ): Promise<void> {
    const where = { learnerId, skillId };
    const [total, recent] = await Promise.all([
      tx.skillObservation.count({ where }),
      tx.skillObservation.findMany({
        where,
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
        take: DEFAULT_MASTERY_MODEL.window,
        select: { score: true, sourceId: true, observedAt: true },
      }),
    ]);
    const mastery = assessMastery(recent, total);
    const lastObservedAt = recent[0]?.observedAt ?? new Date();
    const data = {
      level: mastery.level,
      observationCount: mastery.observationCount,
      recentAccuracy: mastery.recentAccuracy,
      lastObservedAt,
    };
    await tx.skillMastery.upsert({
      where: { learnerId_skillId: { learnerId, skillId } },
      create: { tenantId, learnerId, skillId, ...data },
      update: data,
    });
  }

  private async progressOf(tx: Tx, learnerId: string): Promise<LearnerProgress> {
    const [completions, mastery] = await Promise.all([
      tx.lessonCompletion.findMany({ where: { learnerId }, orderBy: { completedAt: 'asc' } }),
      tx.skillMastery.findMany({ where: { learnerId }, orderBy: { lastObservedAt: 'desc' } }),
    ]);
    return {
      completedLessons: completions.map(toCompletionView),
      skills: mastery.map((row) => ({
        skillId: row.skillId,
        level: row.level,
        observationCount: row.observationCount,
        recentAccuracy: row.recentAccuracy,
        lastObservedAt: row.lastObservedAt.toISOString(),
      })),
    };
  }
}

function toCompletionView(row: {
  lessonId: string;
  lessonVersionId: string;
  completedAt: Date;
}): LessonCompletionView {
  return {
    lessonId: row.lessonId,
    lessonVersionId: row.lessonVersionId,
    completedAt: row.completedAt.toISOString(),
  };
}
