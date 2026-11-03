'use client';

import type { ZodError } from 'zod';
import { useT } from '@/lib/i18n';

/** Contract validation problems, shown before anything is sent. The API checks again. */
export function ProblemList({ error }: { error: ZodError | null }) {
  const t = useT();
  if (!error) {
    return null;
  }
  return (
    <div role="alert" className="rounded-control bg-coral/15 px-4 py-3 text-danger">
      <p className="font-bold">{t('studio.question.invalid')}</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {error.issues.slice(0, 8).map((issue) => (
          <li key={`${issue.path.join('.')}-${issue.message}`}>
            {issue.path.join('.') || t('studio.question.whole')}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
