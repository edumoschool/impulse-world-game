'use client';

import type {
  LearnerAssessmentSummary,
  LearnerLessonSummary,
  LearnerPathSummary,
} from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { WorldMap } from '@/components/world-map';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { learnKeys, useLocalized } from '@/lib/learn';
import { useRequireSession, useSignOut } from '@/lib/session';

/** The child's landing screen: a greeting, and what there is to learn. Worlds arrive in Stage 5. */
export default function PlayPage() {
  const t = useT();
  const text = useLocalized();
  const session = useRequireSession('CHILD');
  const signOut = useSignOut();
  const enabled = session !== null;

  const paths = useQuery({
    queryKey: learnKeys.paths,
    queryFn: () => api<LearnerPathSummary[]>('/learn/paths'),
    enabled,
  });
  const lessons = useQuery({
    queryKey: learnKeys.lessons,
    queryFn: () => api<LearnerLessonSummary[]>('/learn/lessons'),
    enabled,
  });
  const quizzes = useQuery({
    queryKey: learnKeys.quizzes,
    queryFn: () => api<LearnerAssessmentSummary[]>('/learn/assessments'),
    enabled,
  });

  if (!session) {
    return <div className="min-h-dvh bg-sky" />;
  }
  return (
    <div className="on-sky flex min-h-dvh flex-col gap-6 bg-sky px-4 py-6 text-white sm:px-6 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-display text-xl font-bold">IMPULSE WORLD</p>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button type="button" onClick={() => void signOut()} className="key key-quiet text-ink">
            {t('common.signOut')}
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-10">
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-center lg:gap-16">
          <div className="max-w-md">
            <h1 className="font-display text-4xl leading-tight font-bold lg:text-5xl">
              {t('play.greeting', { name: session.user.displayName })}
            </h1>
            <p className="mt-4 text-lg">{t('play.lead')}</p>
            <Link href="/play/progress" className="key mt-6">
              {t('learn.progressLink')}
            </Link>
          </div>
          <div className="h-72 w-full max-w-xs lg:h-[28rem] lg:max-w-sm">
            <WorldMap />
          </div>
        </div>

        <section aria-labelledby="learn-heading" className="mx-auto w-full max-w-5xl">
          <h2 id="learn-heading" className="font-display text-2xl font-bold">
            {t('play.learnHeading')}
          </h2>
          <div className="mt-4 grid gap-4 text-ink lg:grid-cols-3">
            <Shelf
              title={t('learn.paths')}
              empty={t('learn.emptyPaths')}
              failed={paths.isError}
              items={paths.data?.map((path) => ({
                id: path.learningPathId,
                href: `/play/paths/${path.learningPathId}`,
                title: text(path.title),
                detail: t('learn.path.lessons', { count: path.lessonCount }),
              }))}
            />
            <Shelf
              title={t('learn.lessons')}
              empty={t('learn.emptyLessons')}
              failed={lessons.isError}
              items={lessons.data?.map((lesson) => ({
                id: lesson.lessonId,
                href: `/play/lessons/${lesson.lessonId}`,
                title: text(lesson.title),
                detail: t('learn.minutes', { minutes: lesson.estimatedMinutes }),
              }))}
            />
            <Shelf
              title={t('learn.quizzes')}
              empty={t('learn.emptyQuizzes')}
              failed={quizzes.isError}
              items={quizzes.data?.map((quiz) => ({
                id: quiz.assessmentId,
                href: `/play/quizzes/${quiz.assessmentId}`,
                title: text(quiz.title),
                detail: t('learn.quiz.items', { count: quiz.itemCount }),
              }))}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

interface ShelfItem {
  id: string;
  href: string;
  title: string;
  detail: ReactNode;
}

/** One column of things to open. Empty and failed states say so in words. */
function Shelf(props: { title: string; empty: string; failed: boolean; items?: ShelfItem[] }) {
  const t = useT();
  return (
    <section className="rounded-sheet bg-sheet p-5">
      <h3 className="font-display text-lg font-bold">{props.title}</h3>
      {props.failed ? <p role="alert">{t('learn.loadFailed')}</p> : null}
      {props.items?.length === 0 ? <p className="mt-2 text-ink-soft">{props.empty}</p> : null}
      <ul className="mt-3 flex flex-col gap-2">
        {props.items?.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex min-h-14 flex-col justify-center rounded-control border-2 border-line px-4 py-2 hover:border-sky"
            >
              <span className="text-lg font-bold">{item.title}</span>
              <span className="text-sm text-ink-soft">{item.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
