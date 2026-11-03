'use client';

import type { LearnerLesson, LessonCompletionView } from '@impulse/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { ChildShell, LoadState } from '@/components/learn/child-shell';
import { LessonBlock } from '@/components/learn/lesson-block';
import { api, ApiError } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { learnKeys, useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';

export default function LessonPage() {
  const t = useT();
  const text = useLocalized();
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession('CHILD');
  const client = useQueryClient();

  const lesson = useQuery({
    queryKey: learnKeys.lesson(id),
    queryFn: () => api<LearnerLesson>(`/learn/lessons/${id}`),
    enabled: session !== null,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const finish = useMutation({
    mutationFn: () => api<LessonCompletionView>(`/learn/lessons/${id}/complete`, 'POST'),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: learnKeys.progress });
      void client.invalidateQueries({ queryKey: learnKeys.paths });
    },
  });

  if (!session) {
    return null;
  }
  if (!lesson.data) {
    const gone = lesson.error instanceof ApiError && lesson.error.status === 404;
    return (
      <ChildShell>
        {gone ? (
          <p className="text-lg">{t('learn.notFound')}</p>
        ) : (
          <LoadState failed={lesson.isError} />
        )}
      </ChildShell>
    );
  }
  const data = lesson.data;
  return (
    <ChildShell>
      <article className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-3xl leading-tight font-bold">{text(data.title)}</h1>
          <p className="mt-2 text-ink-soft">
            {data.summary ? `${text(data.summary)} · ` : ''}
            {t('learn.minutes', { minutes: data.estimatedMinutes })}
          </p>
        </header>
        {data.blocks.map((block) => (
          <LessonBlock key={block.id} block={block} />
        ))}
        <footer className="mt-4 flex flex-col items-start gap-3">
          {finish.isSuccess ? (
            <FormNotice>{t('learn.lesson.finished')}</FormNotice>
          ) : (
            <button
              type="button"
              className="key"
              disabled={finish.isPending}
              onClick={() => finish.mutate()}
            >
              {t('learn.lesson.finish')}
            </button>
          )}
          {finish.isError ? <FormAlert>{t(errorKey(finish.error))}</FormAlert> : null}
        </footer>
      </article>
    </ChildShell>
  );
}
