'use client';

import type { LearnerPath } from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChildShell, LoadState } from '@/components/learn/child-shell';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { learnKeys, useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';

export default function PathPage() {
  const t = useT();
  const text = useLocalized();
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession('CHILD');

  const path = useQuery({
    queryKey: learnKeys.path(id),
    queryFn: () => api<LearnerPath>(`/learn/paths/${id}`),
    enabled: session !== null,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });

  if (!session) {
    return null;
  }
  if (!path.data) {
    const gone = path.error instanceof ApiError && path.error.status === 404;
    return (
      <ChildShell>
        {gone ? (
          <p className="text-lg">{t('learn.notFound')}</p>
        ) : (
          <LoadState failed={path.isError} />
        )}
      </ChildShell>
    );
  }
  const lessons = path.data.units.flatMap((unit) => unit.lessons);
  const done = lessons.filter((lesson) => lesson.completed).length;
  return (
    <ChildShell>
      <h1 className="font-display text-3xl leading-tight font-bold">{text(path.data.title)}</h1>
      {path.data.summary ? <p className="mt-2 text-lg">{text(path.data.summary)}</p> : null}
      <p className="mt-2 text-ink-soft">{t('learn.path.count', { done, total: lessons.length })}</p>
      <ol className="mt-8 flex flex-col gap-8">
        {path.data.units.map((unit, index) => (
          <li key={unit.id}>
            <p className="text-sm font-bold text-ink-soft uppercase">
              {t('learn.path.unit', { number: index + 1 })}
            </p>
            <h2 className="font-display text-xl font-bold">{text(unit.title)}</h2>
            {unit.summary ? <p className="mt-1 text-ink-soft">{text(unit.summary)}</p> : null}
            <ol className="mt-3 flex flex-col gap-2">
              {unit.lessons.map((lesson) => (
                <li key={lesson.lessonId}>
                  <Link
                    href={`/play/lessons/${lesson.lessonId}`}
                    data-testid="path-lesson"
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-control border-2 px-4 py-2 ${
                      lesson.locked
                        ? 'border-line bg-paper text-ink-soft'
                        : 'border-line bg-sheet hover:border-sky'
                    }`}
                  >
                    <span>
                      <span className="block text-lg font-bold">{text(lesson.title)}</span>
                      <span className="text-sm">
                        {lesson.locked
                          ? t('learn.path.locked')
                          : t('learn.minutes', { minutes: lesson.estimatedMinutes })}
                      </span>
                    </span>
                    {lesson.completed ? (
                      <span className="rounded-full bg-mint px-3 py-1 text-sm font-bold text-ink">
                        ✓ {t('learn.path.done')}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </ChildShell>
  );
}
