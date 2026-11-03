'use client';

import type { LearnerLessonBlock, QuestionResponse } from '@impulse/contracts';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { QuestionInput } from './question-input';

/**
 * One block of a lesson. Pictures, sound and video are not served yet, so their required text
 * alternative stands in: the alt text for a picture, the transcript for sound and video.
 */
export function LessonBlock({ block }: { block: LearnerLessonBlock }) {
  const t = useT();
  const text = useLocalized();

  switch (block.type) {
    case 'TEXT':
      return <p className="text-lg leading-relaxed whitespace-pre-line">{text(block.body)}</p>;
    case 'IMAGE':
      return (
        <figure className="rounded-control border-2 border-dashed border-line bg-sheet p-4">
          <p className="text-sm font-bold text-ink-soft uppercase">{t('learn.lesson.picture')}</p>
          <p className="mt-1 text-lg">{text(block.alt)}</p>
          {block.caption ? (
            <figcaption className="mt-2 text-ink-soft">{text(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'AUDIO':
    case 'VIDEO':
      return (
        <section className="rounded-control border-2 border-dashed border-line bg-sheet p-4">
          <h2 className="font-bold">
            {t(block.type === 'AUDIO' ? 'learn.lesson.listen' : 'learn.lesson.watch')}
          </h2>
          <p className="mt-1 text-ink-soft">{t('learn.lesson.mediaSoon')}</p>
          <p className="mt-2 text-lg whitespace-pre-line">{text(block.transcript)}</p>
        </section>
      );
    case 'QUESTION':
      return <PracticeQuestion block={block} />;
  }
}

/** Lesson questions are practice: the answer stays on the screen and nothing is marked. */
function PracticeQuestion({ block }: { block: Extract<LearnerLessonBlock, { type: 'QUESTION' }> }) {
  const t = useT();
  const [answer, setAnswer] = useState<QuestionResponse | null>(null);
  return (
    <section className="rounded-sheet bg-sheet p-5 shadow-[0_4px_0_var(--color-line)]">
      <p className="mb-3 text-sm font-bold text-ink-soft">{t('learn.lesson.practice')}</p>
      <QuestionInput question={block.question} value={answer} onChange={setAnswer} />
    </section>
  );
}
