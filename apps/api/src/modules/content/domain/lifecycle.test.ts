import { CONTENT_ACTIONS, CONTENT_STATES, type Permission } from '@impulse/contracts';
import { describe, expect, it } from 'vitest';
import { decideTransition, isEditable } from './lifecycle.js';

const CREATOR: Permission[] = ['content.create', 'content.edit', 'content.submit_for_review'];
const REVIEWER: Permission[] = ['content.review', 'content.publish'];
const actor = (userId: string, permissions: Permission[]) => ({
  userId,
  permissions: new Set(permissions),
});

const author = actor('author', [...CREATOR, ...REVIEWER]);
const reviewer = actor('reviewer', REVIEWER);
const creator = actor('creator', CREATOR);

describe('content lifecycle', () => {
  it('walks the full path with an independent reviewer', () => {
    let state = 'DRAFT' as (typeof CONTENT_STATES)[number];
    for (const [action, who] of [
      ['submit', author],
      ['approve', reviewer],
      ['publish', reviewer],
      ['archive', reviewer],
    ] as const) {
      const result = decideTransition({ state, authorId: 'author' }, action, who);
      expect(result.ok, action).toBe(true);
      if (result.ok) {
        state = result.to;
      }
    }
    expect(state).toBe('ARCHIVED');
  });

  it('never lets the author approve or publish their own version, even as a reviewer', () => {
    expect(decideTransition({ state: 'IN_REVIEW', authorId: 'author' }, 'approve', author)).toEqual(
      { ok: false, reason: 'SELF_REVIEW' },
    );
    expect(decideTransition({ state: 'APPROVED', authorId: 'author' }, 'publish', author)).toEqual({
      ok: false,
      reason: 'SELF_REVIEW',
    });
  });

  it('stops a creator without review rights from approving or publishing', () => {
    expect(
      decideTransition({ state: 'IN_REVIEW', authorId: 'someone' }, 'approve', creator),
    ).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(
      decideTransition({ state: 'APPROVED', authorId: 'someone' }, 'publish', creator),
    ).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('cannot skip review: a draft cannot be approved or published', () => {
    for (const action of ['approve', 'publish'] as const) {
      expect(decideTransition({ state: 'DRAFT', authorId: 'a' }, action, reviewer)).toEqual({
        ok: false,
        reason: 'INVALID_TRANSITION',
      });
    }
  });

  it('sends rejected work back to draft, and needs a reason', () => {
    expect(
      decideTransition({ state: 'IN_REVIEW', authorId: 'author' }, 'reject', reviewer),
    ).toEqual({ ok: false, reason: 'REASON_REQUIRED' });
    expect(
      decideTransition({ state: 'APPROVED', authorId: 'author' }, 'reject', reviewer, {
        reason: 'The second question has two right answers',
      }),
    ).toEqual({ ok: true, from: 'APPROVED', to: 'DRAFT' });
  });

  it('has no way out of ARCHIVED and no way back from PUBLISHED except archiving', () => {
    for (const action of CONTENT_ACTIONS) {
      expect(
        decideTransition({ state: 'ARCHIVED', authorId: 'a' }, action, reviewer, { reason: 'x' })
          .ok,
      ).toBe(false);
    }
    const fromPublished = CONTENT_ACTIONS.filter(
      (action) =>
        decideTransition({ state: 'PUBLISHED', authorId: 'a' }, action, reviewer, {
          reason: 'x',
        }).ok,
    );
    expect(fromPublished).toEqual(['archive']);
  });

  it('lets only drafts be edited', () => {
    expect(CONTENT_STATES.filter((state) => isEditable({ state }))).toEqual(['DRAFT']);
  });
});
