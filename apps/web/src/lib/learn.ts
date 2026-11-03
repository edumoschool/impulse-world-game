'use client';

import { type LocalizedText, pickLocalized } from '@impulse/contracts';
import { useCallback } from 'react';
import { useLocale } from './i18n';

/**
 * Picks the learner's language from authored text, falling back as the contract describes.
 * Teaching content is authored per language, so it never goes through the message catalogue.
 */
export function useLocalized() {
  const locale = useLocale();
  return useCallback((text: LocalizedText) => pickLocalized(text, locale), [locale]);
}

/** Query keys for learner data. A finished lesson or quiz invalidates the affected ones. */
export const learnKeys = {
  paths: ['learn', 'paths'] as const,
  path: (id: string) => ['learn', 'paths', id] as const,
  lessons: ['learn', 'lessons'] as const,
  lesson: (id: string) => ['learn', 'lessons', id] as const,
  quizzes: ['learn', 'quizzes'] as const,
  progress: ['learn', 'progress'] as const,
  skills: ['learn', 'skills'] as const,
};
