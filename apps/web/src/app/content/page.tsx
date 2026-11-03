'use client';

import type {
  AssessmentView,
  ContentState,
  LearningPathView,
  LessonView,
  LocalizedText,
  QuestionBankView,
  QuestionView,
  SubjectView,
} from '@impulse/contracts';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { AdultShell } from '@/components/adult-shell';
import { FormAlert } from '@/components/form-alert';
import { SelectField } from '@/components/select-field';
import { type AnyView, latestState, titleOf } from '@/components/studio/item-titles';
import { LocalizedInput } from '@/components/studio/localized-input';
import { StateBadge } from '@/components/studio/version-panel';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';
import {
  can,
  canUseStudio,
  cleanText,
  EditingLocale,
  hasText,
  KINDS,
  type Kind,
  studioKeys,
} from '@/lib/studio';

const LISTED: {
  kind: Exclude<Kind, 'question'>;
  heading: 'studio.lessons' | 'studio.quizzes' | 'studio.paths';
  create: 'studio.newLesson' | 'studio.newQuiz' | 'studio.newPath';
}[] = [
  { kind: 'lesson', heading: 'studio.lessons', create: 'studio.newLesson' },
  { kind: 'assessment', heading: 'studio.quizzes', create: 'studio.newQuiz' },
  { kind: 'path', heading: 'studio.paths', create: 'studio.newPath' },
];

const QUEUE_STATES: ContentState[] = ['IN_REVIEW', 'APPROVED'];
const QUEUE_KINDS: Kind[] = ['question', 'lesson', 'assessment', 'path'];

/** The content studio: everything a school writes, and what is waiting for review. */
export default function ContentStudioPage() {
  const t = useT();
  const text = useLocalized();
  const session = useRequireSession('ADULT');
  const allowed = session !== null && canUseStudio(session);
  const reviewer =
    session !== null && (can(session, 'content.review') || can(session, 'content.publish'));

  const banks = useQuery({
    queryKey: studioKeys.banks,
    queryFn: () => api<QuestionBankView[]>('/question-banks'),
    enabled: allowed,
  });
  const lists = useQueries({
    queries: LISTED.map(({ kind }) => ({
      queryKey: studioKeys.list(kind),
      queryFn: () => api<AnyView[]>(`/${KINDS[kind].base}`),
      enabled: allowed,
    })),
  });
  const queues = useQueries({
    queries: QUEUE_KINDS.flatMap((kind) =>
      QUEUE_STATES.map((state) => ({
        queryKey: studioKeys.queue(kind, state),
        queryFn: () => api<AnyView[]>(`/${KINDS[kind].versions}/review-queue?state=${state}`),
        enabled: reviewer,
      })),
    ),
  });

  if (!session) {
    return null;
  }
  if (!allowed) {
    return (
      <AdultShell session={session}>
        <p>{t('error.FORBIDDEN')}</p>
      </AdultShell>
    );
  }

  const waiting = QUEUE_KINDS.flatMap((kind, kindIndex) =>
    QUEUE_STATES.flatMap((_state, stateIndex) =>
      (queues[kindIndex * QUEUE_STATES.length + stateIndex]?.data ?? []).map((view) => ({
        kind,
        view,
      })),
    ),
  );

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('studio.heading')}</h1>
      <p className="mt-1 text-ink-soft">{t('studio.lead')}</p>

      {reviewer ? (
        <section aria-labelledby="queue-heading" className="mt-10">
          <h2 id="queue-heading" className="font-display text-xl font-bold">
            {t('studio.queue')}
          </h2>
          {waiting.length === 0 ? (
            <p className="mt-2 text-ink-soft">{t('studio.queueEmpty')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2" data-testid="review-queue">
              {waiting.map(({ kind, view }) => (
                <ItemRow key={`${kind}-${view.id}`} kind={kind} view={view} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section aria-labelledby="banks-heading" className="mt-10">
        <h2 id="banks-heading" className="font-display text-xl font-bold">
          {t('studio.banks')}
        </h2>
        {banks.isError ? <p role="alert">{t('learn.loadFailed')}</p> : null}
        {banks.data?.length === 0 ? (
          <p className="mt-2 text-ink-soft">{t('studio.banksEmpty')}</p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-2">
          {banks.data?.map((bank) => (
            <li key={bank.id}>
              <Link
                href={`/content/banks/${bank.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-control border-2 border-line bg-sheet px-4 py-2 hover:border-sky"
              >
                <span className="font-bold">{text(bank.title)}</span>
                <span className="text-sm text-ink-soft">
                  {t('studio.questionCount', { count: bank.questionCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {can(session, 'content.create') ? <NewBankForm /> : null}
      </section>

      {LISTED.map(({ kind, heading, create }, index) => {
        const list = lists[index];
        return (
          <section key={kind} className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">{t(heading)}</h2>
              {can(session, 'content.create') ? (
                <Link href={`${KINDS[kind].editor}/new`} className="key key-quiet">
                  {t(create)}
                </Link>
              ) : null}
            </div>
            {list?.isError ? <p role="alert">{t('learn.loadFailed')}</p> : null}
            {list?.data?.length === 0 ? (
              <p className="mt-2 text-ink-soft">{t('studio.nothingYet')}</p>
            ) : null}
            <ul className="mt-3 flex flex-col gap-2">
              {list?.data?.map((view) => (
                <ItemRow key={view.id} kind={kind} view={view} />
              ))}
            </ul>
          </section>
        );
      })}
    </AdultShell>
  );
}

function ItemRow({ kind, view }: { kind: Kind; view: AnyView }) {
  const text = useLocalized();
  const state = latestState(view);
  return (
    <li>
      <Link
        href={`${KINDS[kind].editor}/${view.id}`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-control border-2 border-line bg-sheet px-4 py-2 hover:border-sky"
      >
        <span className="font-bold">
          {text(titleOf(view as QuestionView | LessonView | AssessmentView | LearningPathView))}
        </span>
        {state ? <StateBadge state={state} /> : null}
      </Link>
    </li>
  );
}

function NewBankForm() {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const [title, setTitle] = useState<LocalizedText>({});
  const [subjectId, setSubjectId] = useState('');
  const [missing, setMissing] = useState(false);
  const subjects = useQuery({
    queryKey: studioKeys.subjects,
    queryFn: () => api<SubjectView[]>('/curriculum/subjects'),
  });
  const text = useLocalized();
  const create = useMutation({
    mutationFn: () => api('/question-banks', 'POST', { subjectId, title: cleanText(title) }),
    onSuccess: () => {
      setTitle({});
      void client.invalidateQueries({ queryKey: studioKeys.banks });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMissing(!hasText(title) || !subjectId);
    if (hasText(title) && subjectId) {
      create.mutate();
    }
  };
  return (
    <EditingLocale.Provider value={locale}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-sheet bg-sheet p-5">
        <h3 className="font-bold">{t('studio.newBank')}</h3>
        <LocalizedInput
          label={t('studio.field.title')}
          value={title}
          onChange={setTitle}
          required
        />
        <SelectField
          label={t('studio.field.subject')}
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">{t('studio.chooseSubject')}</option>
          {subjects.data?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {text(subject.title)}
            </option>
          ))}
        </SelectField>
        {missing ? <FormAlert>{t('studio.fillRequired')}</FormAlert> : null}
        {create.isError ? <FormAlert>{t(errorKey(create.error))}</FormAlert> : null}
        <button type="submit" className="key self-start" disabled={create.isPending}>
          {t('studio.createBank')}
        </button>
      </form>
    </EditingLocale.Provider>
  );
}
