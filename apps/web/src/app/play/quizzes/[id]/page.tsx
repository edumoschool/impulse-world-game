'use client';

import type {
  LearnerAssessmentSummary,
  LearnerAttempt,
  QuestionResponse,
  SavedResponse,
} from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { ChildShell, LoadState } from '@/components/learn/child-shell';
import { QuestionInput } from '@/components/learn/question-input';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { learnKeys, useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';

type Phase = 'idle' | 'busy' | 'saved';

/**
 * Taking a quiz. Answers are saved to the server as the learner moves between questions, and
 * the server marks them on submission. This page never knows which answers are right.
 */
export default function QuizPage() {
  const t = useT();
  const text = useLocalized();
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession('CHILD');
  const client = useQueryClient();

  const quizzes = useQuery({
    queryKey: learnKeys.quizzes,
    queryFn: () => api<LearnerAssessmentSummary[]>('/learn/assessments'),
    enabled: session !== null,
  });
  const [attempt, setAttempt] = useState<LearnerAttempt | null>(null);
  const [answers, setAnswers] = useState<Map<string, QuestionResponse | null>>(new Map());
  const [unsaved, setUnsaved] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<MessageKey | null>(null);

  if (!session) {
    return null;
  }
  const summary = quizzes.data?.find((quiz) => quiz.assessmentId === id);
  if (!summary && !attempt) {
    return (
      <ChildShell>
        {quizzes.data ? (
          <p className="text-lg">{t('learn.notFound')}</p>
        ) : (
          <LoadState failed={quizzes.isError} />
        )}
      </ChildShell>
    );
  }

  const run = async (work: () => Promise<void>) => {
    setPhase('busy');
    setFailure(null);
    try {
      await work();
      setPhase('saved');
    } catch (error) {
      setFailure(errorKey(error));
      setPhase('idle');
    }
  };

  const begin = (started: LearnerAttempt) => {
    setAttempt(started);
    setAnswers(new Map(started.items.map((item) => [item.id, item.response])));
    setUnsaved(new Set());
    setIndex(0);
  };

  const start = () =>
    run(async () => {
      begin(await api<LearnerAttempt>(`/learn/assessments/${id}/attempts`, 'POST'));
    });

  /** Saves the answers changed since the last save. A cleared answer keeps its saved value. */
  const saveChanged = async (current: LearnerAttempt) => {
    for (const itemId of unsaved) {
      const response = answers.get(itemId);
      if (response) {
        await api<SavedResponse>(
          `/learn/attempts/${current.attemptId}/responses/${encodeURIComponent(itemId)}`,
          'PUT',
          { response },
        );
      }
    }
    setUnsaved(new Set());
  };

  const goTo = (next: number) =>
    run(async () => {
      if (attempt) {
        await saveChanged(attempt);
      }
      setIndex(next);
    });

  const submit = () =>
    run(async () => {
      if (!attempt) {
        return;
      }
      await saveChanged(attempt);
      setAttempt(await api<LearnerAttempt>(`/learn/attempts/${attempt.attemptId}/submit`, 'POST'));
      void client.invalidateQueries({ queryKey: learnKeys.quizzes });
      void client.invalidateQueries({ queryKey: learnKeys.progress });
    });

  // Before starting: what the quiz is, and how many tries are left.
  if (!attempt && summary) {
    const triesLeft = summary.maxAttempts === null || summary.attemptsUsed < summary.maxAttempts;
    return (
      <ChildShell>
        <h1 className="font-display text-3xl leading-tight font-bold">{text(summary.title)}</h1>
        <p className="mt-2 text-lg">{t('learn.quiz.items', { count: summary.itemCount })}</p>
        {summary.maxAttempts !== null ? (
          <p className="mt-1 text-ink-soft">
            {t('learn.quiz.tries', { used: summary.attemptsUsed, max: summary.maxAttempts })}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col items-start gap-3">
          {triesLeft ? (
            <button
              type="button"
              className="key"
              disabled={phase === 'busy'}
              onClick={() => void start()}
            >
              {t('learn.quiz.start')}
            </button>
          ) : (
            <FormAlert>{t('error.ATTEMPT_LIMIT_REACHED')}</FormAlert>
          )}
          {failure ? <FormAlert>{t(failure)}</FormAlert> : null}
        </div>
      </ChildShell>
    );
  }
  if (!attempt) {
    return null;
  }

  // After submitting: the server's result, item by item, with no answer key.
  if (attempt.result) {
    const result = attempt.result;
    const prompts = new Map(attempt.items.map((item) => [item.id, text(item.question.prompt)]));
    const canRetry =
      summary !== undefined &&
      (summary.maxAttempts === null || summary.attemptsUsed < summary.maxAttempts);
    return (
      <ChildShell>
        <h1 className="font-display text-3xl font-bold">{t('learn.quiz.resultTitle')}</h1>
        <p className="mt-2 text-lg">{text(attempt.title)}</p>
        <p data-testid="quiz-score" className="mt-6 font-display text-4xl font-bold">
          {t('learn.quiz.score', { earned: result.earnedPoints, max: result.maxPoints })}
        </p>
        <p className="mt-2 text-xl font-bold">
          {result.passed === null
            ? t('learn.quiz.pending', { count: result.pendingReview })
            : t(result.passed ? 'learn.quiz.passed' : 'learn.quiz.notPassed')}
        </p>
        <ol className="mt-8 flex flex-col gap-2">
          {result.items.map((item, position) => (
            <li
              key={item.itemId}
              data-testid="quiz-outcome"
              className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-sheet px-4 py-3"
            >
              <span>
                {position + 1}. {prompts.get(item.itemId)}
              </span>
              <span className={`font-bold ${OUTCOME_STYLE[item.outcome]}`}>
                {t(`learn.outcome.${item.outcome}` as MessageKey)}
              </span>
            </li>
          ))}
        </ol>
        {canRetry ? (
          <button type="button" className="key key-quiet mt-8" onClick={() => setAttempt(null)}>
            {t('learn.quiz.tryAgain')}
          </button>
        ) : null}
      </ChildShell>
    );
  }

  // Answering, one question at a time.
  const item = attempt.items[index];
  if (!item) {
    return null;
  }
  const last = index === attempt.items.length - 1;
  const unanswered = attempt.items.filter((entry) => !answers.get(entry.id)).length;
  return (
    <ChildShell>
      <p className="text-sm font-bold text-ink-soft uppercase">{text(attempt.title)}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {t('learn.quiz.question', { number: index + 1, total: attempt.items.length })}
        </p>
        <p className="text-sm text-ink-soft" role="status">
          {phase === 'busy'
            ? t('learn.quiz.saving')
            : phase === 'saved'
              ? t('learn.quiz.saved')
              : ''}
        </p>
      </div>
      <div className="mt-6 rounded-sheet bg-sheet p-5 sm:p-8">
        <QuestionInput
          key={item.id}
          question={item.question}
          value={answers.get(item.id) ?? null}
          disabled={phase === 'busy'}
          onChange={(value) => {
            setAnswers((previous) => new Map(previous).set(item.id, value));
            setUnsaved((previous) => new Set(previous).add(item.id));
            setPhase('idle');
          }}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="key key-quiet"
          disabled={index === 0 || phase === 'busy'}
          onClick={() => void goTo(index - 1)}
        >
          {t('learn.quiz.previous')}
        </button>
        {last ? (
          <button
            type="button"
            className="key"
            disabled={phase === 'busy'}
            onClick={() => void submit()}
          >
            {t('learn.quiz.submit')}
          </button>
        ) : (
          <button
            type="button"
            className="key"
            disabled={phase === 'busy'}
            onClick={() => void goTo(index + 1)}
          >
            {t('learn.quiz.next')}
          </button>
        )}
      </div>
      {last && unanswered > 0 ? (
        <p className="mt-4 text-ink-soft">{t('learn.quiz.unanswered', { count: unanswered })}</p>
      ) : null}
      {failure ? (
        <div className="mt-4">
          <FormAlert>{t(failure)}</FormAlert>
        </div>
      ) : null}
    </ChildShell>
  );
}

/** Colour backs up the words, never replaces them. Ink-dark tones keep contrast on white. */
const OUTCOME_STYLE: Record<string, string> = {
  CORRECT: 'text-ink',
  PARTIAL: 'text-ink-soft',
  INCORRECT: 'text-danger',
  UNANSWERED: 'text-ink-soft',
  NEEDS_REVIEW: 'text-ink-soft',
};
