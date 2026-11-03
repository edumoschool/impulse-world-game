'use client';

import type { LearnerProgress, SkillView } from '@impulse/contracts';
import { MASTERY_LEVELS } from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useQuery } from '@tanstack/react-query';
import { ChildShell, LoadState } from '@/components/learn/child-shell';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { learnKeys, useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';

export default function ProgressPage() {
  const t = useT();
  const text = useLocalized();
  const session = useRequireSession('CHILD');
  const enabled = session !== null;

  const progress = useQuery({
    queryKey: learnKeys.progress,
    queryFn: () => api<LearnerProgress>('/learn/progress'),
    enabled,
  });
  const skills = useQuery({
    queryKey: learnKeys.skills,
    queryFn: () => api<SkillView[]>('/curriculum/skills'),
    enabled,
  });

  if (!session) {
    return null;
  }
  if (!progress.data) {
    return (
      <ChildShell>
        <LoadState failed={progress.isError} />
      </ChildShell>
    );
  }
  const names = new Map((skills.data ?? []).map((skill) => [skill.id, text(skill.title)]));
  const lessonsDone = new Set(progress.data.completedLessons.map((entry) => entry.lessonId)).size;
  return (
    <ChildShell>
      <h1 className="font-display text-3xl font-bold">{t('learn.progress.title')}</h1>
      <p data-testid="lessons-finished" className="mt-4 text-xl">
        {t('learn.progress.lessons', { count: lessonsDone })}
      </p>
      <h2 className="mt-8 font-display text-xl font-bold">{t('learn.progress.skills')}</h2>
      {progress.data.skills.length === 0 ? (
        <p className="mt-2 text-ink-soft">{t('learn.progress.empty')}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {progress.data.skills.map((skill) => {
            const step = MASTERY_LEVELS.indexOf(skill.level);
            return (
              <li key={skill.skillId} className="rounded-control bg-sheet p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-bold">{names.get(skill.skillId) ?? '…'}</span>
                  <span className="font-bold">{t(`mastery.${skill.level}` as MessageKey)}</span>
                </div>
                {/* Six steps, one per level, so the bar never suggests a percentage. */}
                <div className="mt-2 grid grid-cols-6 gap-1" aria-hidden="true">
                  {MASTERY_LEVELS.map((level, index) => (
                    <span
                      key={level}
                      className={`h-3 rounded-full ${index <= step && step > 0 ? 'bg-sky' : 'bg-line'}`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-sm text-ink-soft">
                  {t('learn.progress.evidence', { count: skill.observationCount })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </ChildShell>
  );
}
