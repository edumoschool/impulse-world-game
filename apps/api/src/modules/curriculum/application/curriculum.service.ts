import { Injectable } from '@nestjs/common';
import {
  type ContentScope,
  type CreateSkillRequest,
  type CreateSubjectRequest,
  ERROR_CODES,
  type GradeLevelView,
  type LocalizedText,
  type SkillView,
  type SubjectView,
} from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import type { TenantActor } from '../../../common/request-context.js';
import { TenantDatabase, type Tx } from '../../../infrastructure/database/tenant-database.js';
import { AuditLog } from '../../audit/index.js';
import { wouldCreateCycle } from '../domain/prerequisites.js';

const scopeOf = (actor: TenantActor) => ({ tenantId: actor.tenantId, userId: actor.userId });
const scopeLabel = (tenantId: string | null): ContentScope => (tenantId ? 'TENANT' : 'GLOBAL');
const text = (value: unknown) => value as LocalizedText;

/**
 * Taxonomy reads return global rows plus the tenant's own; RLS decides which rows exist here.
 * Writes always land in the actor's tenant. Global rows are changed only by the seed.
 */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly database: TenantDatabase,
    private readonly audit: AuditLog,
  ) {}

  listGradeLevels(actor: TenantActor): Promise<GradeLevelView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const levels = await tx.gradeLevel.findMany({ orderBy: { rank: 'asc' } });
      return levels.map((level) => ({
        id: level.id,
        code: level.code,
        title: text(level.title),
        rank: level.rank,
        minAge: level.minAge,
        maxAge: level.maxAge,
        scope: scopeLabel(level.tenantId),
      }));
    });
  }

  listSubjects(actor: TenantActor): Promise<SubjectView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const subjects = await tx.subject.findMany({
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
      return subjects.map(toSubjectView);
    });
  }

  async createSubject(actor: TenantActor, request: CreateSubjectRequest): Promise<SubjectView> {
    try {
      return await this.database.run(scopeOf(actor), async (tx) => {
        const subject = await tx.subject.create({
          data: {
            tenantId: actor.tenantId,
            code: request.code,
            title: request.title,
            description: request.description,
            sortOrder: request.sortOrder,
          },
        });
        await this.audit.record(tx, {
          action: 'curriculum.subject_created',
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          targetType: 'subject',
          targetId: subject.id,
        });
        return toSubjectView(subject);
      });
    } catch (error) {
      throw codeTaken(error) ?? error;
    }
  }

  listSkills(actor: TenantActor, subjectId?: string): Promise<SkillView[]> {
    return this.database.run(scopeOf(actor), async (tx) => {
      const skills = await tx.skill.findMany({
        where: { archivedAt: null, ...(subjectId ? { subjectId } : {}) },
        include: { prerequisites: { select: { prerequisiteId: true } } },
        orderBy: { code: 'asc' },
      });
      return skills.map(toSkillView);
    });
  }

  async createSkill(actor: TenantActor, request: CreateSkillRequest): Promise<SkillView> {
    try {
      return await this.database.run(scopeOf(actor), async (tx) => {
        // Looked up under RLS, so only a global or own-tenant row can be referenced. A foreign
        // key alone would accept another tenant's id, because FK checks ignore RLS.
        const subject = await tx.subject.findFirst({
          where: { id: request.subjectId, archivedAt: null },
        });
        if (!subject) {
          throw AppError.notFound('Subject not found');
        }
        if (request.gradeLevelId) {
          const level = await tx.gradeLevel.findFirst({ where: { id: request.gradeLevelId } });
          if (!level) {
            throw AppError.notFound('Grade level not found');
          }
        }
        const skill = await tx.skill.create({
          data: {
            tenantId: actor.tenantId,
            subjectId: subject.id,
            gradeLevelId: request.gradeLevelId ?? null,
            code: request.code,
            title: request.title,
            description: request.description,
          },
          include: { prerequisites: { select: { prerequisiteId: true } } },
        });
        await this.audit.record(tx, {
          action: 'curriculum.skill_created',
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          targetType: 'skill',
          targetId: skill.id,
        });
        return toSkillView(skill);
      });
    } catch (error) {
      throw codeTaken(error) ?? error;
    }
  }

  async addPrerequisite(actor: TenantActor, skillId: string, prerequisiteId: string) {
    await this.database.run(scopeOf(actor), async (tx) => {
      const skill = await this.ownSkill(tx, actor, skillId);
      const prerequisite = await tx.skill.findFirst({
        where: { id: prerequisiteId, archivedAt: null },
      });
      if (!prerequisite) {
        throw AppError.notFound('Prerequisite skill not found');
      }
      const edges = await tx.skillDependency.findMany({
        select: { skillId: true, prerequisiteId: true },
      });
      if (wouldCreateCycle(edges, skill.id, prerequisite.id)) {
        throw new AppError(
          ERROR_CODES.PREREQUISITE_CYCLE,
          409,
          'That prerequisite would make the skills depend on each other',
        );
      }
      await tx.skillDependency.createMany({
        data: [{ tenantId: actor.tenantId, skillId: skill.id, prerequisiteId: prerequisite.id }],
        skipDuplicates: true,
      });
      await this.audit.record(tx, {
        action: 'curriculum.prerequisite_added',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'skill',
        targetId: skill.id,
        metadata: { prerequisiteId: prerequisite.id },
      });
    });
  }

  async removePrerequisite(actor: TenantActor, skillId: string, prerequisiteId: string) {
    await this.database.run(scopeOf(actor), async (tx) => {
      const skill = await this.ownSkill(tx, actor, skillId);
      const { count } = await tx.skillDependency.deleteMany({
        where: { tenantId: actor.tenantId, skillId: skill.id, prerequisiteId },
      });
      if (count === 0) {
        throw AppError.notFound('Prerequisite not found');
      }
      await this.audit.record(tx, {
        action: 'curriculum.prerequisite_removed',
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        targetType: 'skill',
        targetId: skill.id,
        metadata: { prerequisiteId },
      });
    });
  }

  /**
   * For other modules, inside their transaction: whether a subject is usable here, meaning it
   * is global or the tenant's own and not archived. RLS decides which rows exist.
   */
  async isSubjectVisible(tx: Tx, subjectId: string): Promise<boolean> {
    return (await tx.subject.count({ where: { id: subjectId, archivedAt: null } })) === 1;
  }

  async isGradeLevelVisible(tx: Tx, gradeLevelId: string): Promise<boolean> {
    return (await tx.gradeLevel.count({ where: { id: gradeLevelId } })) === 1;
  }

  /** Same rule for a set of skills: true only if every one of them is usable here. */
  async areSkillsVisible(tx: Tx, skillIds: readonly string[]): Promise<boolean> {
    if (skillIds.length === 0) {
      return true;
    }
    const found = await tx.skill.count({ where: { id: { in: [...skillIds] }, archivedAt: null } });
    return found === new Set(skillIds).size;
  }

  /** Only a tenant's own skills can be changed. A global skill reads as not found here. */
  private async ownSkill(tx: Tx, actor: TenantActor, skillId: string) {
    const skill = await tx.skill.findFirst({
      where: { id: skillId, tenantId: actor.tenantId, archivedAt: null },
    });
    if (!skill) {
      throw AppError.notFound('Skill not found');
    }
    return skill;
  }
}

function codeTaken(error: unknown): AppError | undefined {
  return (error as { code?: string } | null)?.code === 'P2002'
    ? new AppError(ERROR_CODES.CODE_TAKEN, 409, 'That code is already used')
    : undefined;
}

function toSubjectView(subject: {
  id: string;
  tenantId: string | null;
  code: string;
  title: unknown;
  description: unknown;
  sortOrder: number;
}): SubjectView {
  return {
    id: subject.id,
    code: subject.code,
    title: text(subject.title),
    description: subject.description ? text(subject.description) : null,
    sortOrder: subject.sortOrder,
    scope: scopeLabel(subject.tenantId),
  };
}

function toSkillView(skill: {
  id: string;
  tenantId: string | null;
  code: string;
  subjectId: string;
  gradeLevelId: string | null;
  title: unknown;
  description: unknown;
  prerequisites: { prerequisiteId: string }[];
}): SkillView {
  return {
    id: skill.id,
    code: skill.code,
    subjectId: skill.subjectId,
    gradeLevelId: skill.gradeLevelId,
    title: text(skill.title),
    description: skill.description ? text(skill.description) : null,
    prerequisiteIds: skill.prerequisites.map((entry) => entry.prerequisiteId),
    scope: scopeLabel(skill.tenantId),
  };
}
