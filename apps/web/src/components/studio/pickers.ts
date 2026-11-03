'use client';

import type {
  LessonView,
  LocalizedText,
  QuestionBankView,
  QuestionType,
  QuestionView,
} from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { studioKeys } from '@/lib/studio';

export interface PublishedQuestion {
  versionId: string;
  prompt: LocalizedText;
  type: QuestionType;
}

/**
 * Every published question version this school can use, for lesson and quiz pickers. It reads
 * bank by bank, which is fine for a school's library; a search route replaces it at scale.
 */
export function usePublishedQuestions(enabled: boolean) {
  return useQuery({
    queryKey: studioKeys.published('questions'),
    enabled,
    queryFn: async (): Promise<PublishedQuestion[]> => {
      const banks = await api<QuestionBankView[]>('/question-banks');
      const lists = await Promise.all(
        banks.map((bank) => api<QuestionView[]>(`/question-banks/${bank.id}/questions`)),
      );
      return lists.flat().flatMap((question) =>
        question.versions
          .filter((version) => version.state === 'PUBLISHED')
          .map((version) => ({
            versionId: version.id,
            prompt: version.definition.prompt,
            type: question.type,
          })),
      );
    },
  });
}

export interface PublishedLesson {
  lessonId: string;
  title: LocalizedText;
}

/** Lessons with a live version, for the path editor. */
export function usePublishedLessons(enabled: boolean) {
  return useQuery({
    queryKey: studioKeys.published('lessons'),
    enabled,
    queryFn: async (): Promise<PublishedLesson[]> =>
      (await api<LessonView[]>('/lessons')).flatMap((lesson) => {
        const live = lesson.versions.find((version) => version.state === 'PUBLISHED');
        return live ? [{ lessonId: lesson.id, title: live.content.title }] : [];
      }),
  });
}
