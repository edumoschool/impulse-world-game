'use client';

import type { ContentState, LocalizedText, Permission, SessionView } from '@impulse/contracts';
import type { SupportedLocale } from '@impulse/localization';
import { createContext, useContext } from 'react';

/** The four kinds of versioned teaching material, and where their API routes live. */
export const KINDS = {
  question: { versions: 'question-versions', editor: '/content/questions' },
  lesson: { base: 'lessons', versions: 'lesson-versions', editor: '/content/lessons' },
  assessment: { base: 'assessments', versions: 'assessment-versions', editor: '/content/quizzes' },
  path: { base: 'learning-paths', versions: 'learning-path-versions', editor: '/content/paths' },
} as const;
export type Kind = keyof typeof KINDS;

export const studioKeys = {
  banks: ['studio', 'banks'] as const,
  bank: (id: string) => ['studio', 'banks', id] as const,
  question: (id: string) => ['studio', 'questions', id] as const,
  list: (kind: Kind) => ['studio', kind] as const,
  item: (kind: Kind, id: string) => ['studio', kind, id] as const,
  queue: (kind: Kind, state: ContentState) => ['studio', 'queue', kind, state] as const,
  subjects: ['studio', 'subjects'] as const,
  published: (what: 'questions' | 'lessons') => ['studio', 'published', what] as const,
};

/** Display only: whether to offer the studio at all. The API checks every action again. */
export function canUseStudio(session: SessionView): boolean {
  const studio: Permission[] = ['content.create', 'content.review', 'content.publish'];
  return studio.some((permission) => session.permissions.includes(permission));
}

export const can = (session: SessionView, permission: Permission) =>
  session.permissions.includes(permission);

/** The language an editor is writing in. Every localized field edits this language. */
export const EditingLocale = createContext<SupportedLocale>('en');
export const useEditingLocale = () => useContext(EditingLocale);

/** Drops empty and blank languages, so the contract's "at least one language" rule can apply. */
export function cleanText(text: LocalizedText | undefined): LocalizedText {
  const result: LocalizedText = {};
  for (const [locale, value] of Object.entries(text ?? {}) as [keyof LocalizedText, string][]) {
    if (value?.trim()) {
      result[locale] = value.trim();
    }
  }
  return result;
}

export const hasText = (text: LocalizedText | undefined) => Object.keys(cleanText(text)).length > 0;

/** A short id for blocks, items and units, unique enough within one piece of content. */
export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/** Moves an element one step, returning a new array. */
export function moved<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const target = index + by;
  if (target < 0 || target >= next.length) {
    return next;
  }
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export type EditMode =
  | { mode: 'edit' }
  | { mode: 'newVersion' }
  | {
      mode: 'locked';
      reason: 'studio.locked.permission' | 'studio.locked.otherDraft' | 'studio.locked.inReview';
    };

/**
 * Whether this person can change the content now, mirroring the API's draft rules: only the
 * author edits a draft, nothing in review changes, and a live version is changed by a new one.
 */
export function editModeOf(
  session: SessionView,
  latest: { state: ContentState; authorId: string } | undefined,
): EditMode {
  if (!can(session, 'content.edit')) {
    return { mode: 'locked', reason: 'studio.locked.permission' };
  }
  switch (latest?.state) {
    case undefined:
    case 'PUBLISHED':
    case 'ARCHIVED':
      return { mode: 'newVersion' };
    case 'DRAFT':
      return latest.authorId === session.user.id
        ? { mode: 'edit' }
        : { mode: 'locked', reason: 'studio.locked.otherDraft' };
    default:
      return { mode: 'locked', reason: 'studio.locked.inReview' };
  }
}
