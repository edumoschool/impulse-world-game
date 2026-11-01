import type { ContentAction, ContentState, Permission } from '@impulse/contracts';

export interface VersionSubject {
  state: ContentState;
  /** The user who created the version. They may never review or publish it. */
  authorId: string;
}

export interface LifecycleActor {
  userId: string;
  permissions: ReadonlySet<Permission>;
}

export type TransitionRefusal =
  /** The action does not apply to the version's current state. */
  | 'INVALID_TRANSITION'
  /** The actor lacks the permission the action needs. */
  | 'FORBIDDEN'
  /** The actor wrote this version, and the action is a review step. */
  | 'SELF_REVIEW'
  /** Rejections must say why, so the author can act on them. */
  | 'REASON_REQUIRED';

export type TransitionResult =
  { ok: true; from: ContentState; to: ContentState } | { ok: false; reason: TransitionRefusal };

interface Rule {
  from: readonly ContentState[];
  to: ContentState;
  permission: Permission;
  /** Review steps: the author is refused even if they hold the permission. */
  independent: boolean;
}

/** Spec 8.4, with rejection back to DRAFT. ADR-013. */
const RULES: Record<ContentAction, Rule> = {
  submit: {
    from: ['DRAFT'],
    to: 'IN_REVIEW',
    permission: 'content.submit_for_review',
    independent: false,
  },
  approve: { from: ['IN_REVIEW'], to: 'APPROVED', permission: 'content.review', independent: true },
  reject: {
    from: ['IN_REVIEW', 'APPROVED'],
    to: 'DRAFT',
    permission: 'content.review',
    independent: true,
  },
  publish: {
    from: ['APPROVED'],
    to: 'PUBLISHED',
    permission: 'content.publish',
    independent: true,
  },
  archive: {
    from: ['PUBLISHED'],
    to: 'ARCHIVED',
    permission: 'content.publish',
    independent: false,
  },
};

/** Decides one lifecycle step. Pure, so every versioned module applies identical rules. */
export function decideTransition(
  version: VersionSubject,
  action: ContentAction,
  actor: LifecycleActor,
  options: { reason?: string } = {},
): TransitionResult {
  const rule = RULES[action];
  if (!rule.from.includes(version.state)) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }
  if (!actor.permissions.has(rule.permission)) {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  if (rule.independent && actor.userId === version.authorId) {
    return { ok: false, reason: 'SELF_REVIEW' };
  }
  if (action === 'reject' && !options.reason?.trim()) {
    return { ok: false, reason: 'REASON_REQUIRED' };
  }
  return { ok: true, from: version.state, to: rule.to };
}

/** Only drafts change. Anything submitted, approved or published is frozen. */
export function isEditable(version: Pick<VersionSubject, 'state'>): boolean {
  return version.state === 'DRAFT';
}
