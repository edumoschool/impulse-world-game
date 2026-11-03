'use client';

import type { QuestionDefinition, QuestionView } from '@impulse/contracts';
import { isSupportedLocale, type SupportedLocale } from '@impulse/localization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AdultShell } from '@/components/adult-shell';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { LoadState } from '@/components/learn/child-shell';
import { EditingLocalePicker } from '@/components/studio/localized-input';
import { QuestionEditor } from '@/components/studio/question-editor';
import { VersionPanel } from '@/components/studio/version-panel';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { useRequireSession } from '@/lib/session';
import { EditingLocale, editModeOf, studioKeys } from '@/lib/studio';

export default function QuestionPage() {
  const t = useT();
  const client = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const session = useRequireSession('ADULT');
  const [locale, setLocale] = useState<SupportedLocale>(useLocale());

  const question = useQuery({
    queryKey: studioKeys.question(id),
    queryFn: () => api<QuestionView>(`/questions/${id}`),
    enabled: session !== null,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: studioKeys.question(id) });
    void client.invalidateQueries({ queryKey: ['studio'] });
  };
  const save = useMutation({
    mutationFn: (definition: QuestionDefinition) =>
      api<QuestionView>(`/questions/${id}/draft`, 'PUT', { definition }),
    onSuccess: (view) => {
      client.setQueryData(studioKeys.question(id), view);
      refresh();
    },
  });

  if (!session) {
    return null;
  }
  if (!question.data) {
    return (
      <AdultShell session={session}>
        <LoadState failed={question.isError} />
      </AdultShell>
    );
  }
  const view = question.data;
  const latest = view.versions[0];
  const edit = editModeOf(session, latest);
  return (
    <AdultShell session={session}>
      <Link href={`/content/banks/${view.bankId}`} className="font-semibold text-sky underline">
        ← {t('studio.banks')}
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold">{t(`studio.qtype.${view.type}`)}</h1>
      <div className="mt-6">
        <EditingLocalePicker
          value={locale}
          onChange={(next) => isSupportedLocale(next) && setLocale(next)}
        />
      </div>
      {edit.mode === 'locked' ? (
        <p className="mt-4 rounded-control bg-paper p-3">{t(edit.reason)}</p>
      ) : null}
      {edit.mode === 'newVersion' ? (
        <p className="mt-4 text-ink-soft">{t('studio.newVersionHint')}</p>
      ) : null}
      <div className="mt-6 rounded-sheet bg-sheet p-5 sm:p-8">
        <EditingLocale.Provider value={locale}>
          <QuestionEditor
            key={`${latest?.id}-${latest?.state}`}
            initial={latest?.definition ?? null}
            disabled={edit.mode === 'locked'}
            saving={save.isPending}
            submitLabel={
              edit.mode === 'newVersion' ? t('studio.startNewVersion') : t('studio.saveDraft')
            }
            onSave={(definition) => save.mutate(definition)}
          />
        </EditingLocale.Provider>
      </div>
      <div className="mt-4">
        {save.isSuccess ? <FormNotice>{t('studio.saved')}</FormNotice> : null}
        {save.isError ? <FormAlert>{t(errorKey(save.error))}</FormAlert> : null}
      </div>
      <VersionPanel
        kind="question"
        session={session}
        versions={view.versions}
        onChanged={refresh}
      />
    </AdultShell>
  );
}
