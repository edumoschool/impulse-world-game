'use client';

import type { QuestionBankView, QuestionView } from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdultShell } from '@/components/adult-shell';
import { LoadState } from '@/components/learn/child-shell';
import { StateBadge } from '@/components/studio/version-panel';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';
import { can, studioKeys } from '@/lib/studio';

export default function BankPage() {
  const t = useT();
  const text = useLocalized();
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession('ADULT');
  const banks = useQuery({
    queryKey: studioKeys.banks,
    queryFn: () => api<QuestionBankView[]>('/question-banks'),
    enabled: session !== null,
  });
  const questions = useQuery({
    queryKey: studioKeys.bank(id),
    queryFn: () => api<QuestionView[]>(`/question-banks/${id}/questions`),
    enabled: session !== null,
  });
  if (!session) {
    return null;
  }
  const bank = banks.data?.find((entry) => entry.id === id);
  return (
    <AdultShell session={session}>
      <Link href="/content" className="font-semibold text-sky underline">
        ← {t('studio.heading')}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">{bank ? text(bank.title) : '…'}</h1>
        {can(session, 'content.create') ? (
          <Link href={`/content/banks/${id}/new`} className="key">
            {t('studio.newQuestion')}
          </Link>
        ) : null}
      </div>
      {!questions.data ? <LoadState failed={questions.isError} /> : null}
      {questions.data?.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t('studio.nothingYet')}</p>
      ) : null}
      <ul className="mt-6 flex flex-col gap-2">
        {questions.data?.map((question) => {
          const latest = question.versions[0];
          return (
            <li key={question.id}>
              <Link
                href={`/content/questions/${question.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-control border-2 border-line bg-sheet px-4 py-2 hover:border-sky"
              >
                <span>
                  <span className="block font-bold">
                    {latest ? text(latest.definition.prompt) : '—'}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {t(`studio.qtype.${question.type}`)}
                  </span>
                </span>
                {latest ? <StateBadge state={latest.state} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </AdultShell>
  );
}
