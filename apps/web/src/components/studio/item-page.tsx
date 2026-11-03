'use client';

import type { SubjectView } from '@impulse/contracts';
import { isSupportedLocale, type MessageKey, type SupportedLocale } from '@impulse/localization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentType, useState } from 'react';
import { AdultShell } from '@/components/adult-shell';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { LoadState } from '@/components/learn/child-shell';
import { SelectField } from '@/components/select-field';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';
import { EditingLocale, editModeOf, KINDS, studioKeys } from '@/lib/studio';
import type { EditorProps } from './content-editors';
import { EditingLocalePicker } from './localized-input';
import { type VersionSummary, VersionPanel } from './version-panel';

type ContentKind = 'lesson' | 'assessment' | 'path';

interface ItemView<T> {
  id: string;
  versions: (VersionSummary & { content: T })[];
}

/**
 * Creating and editing one lesson, quiz or path: the editor for its newest version, and the
 * version history with the review steps this person may take.
 */
export function StudioItemPage<T>({
  kind,
  id,
  heading,
  Editor,
}: {
  kind: ContentKind;
  id: string;
  heading: { create: MessageKey; edit: MessageKey };
  Editor: ComponentType<EditorProps<T>>;
}) {
  const t = useT();
  const text = useLocalized();
  const router = useRouter();
  const client = useQueryClient();
  const session = useRequireSession('ADULT');
  const [locale, setLocale] = useState<SupportedLocale>(useLocale());
  const [subjectId, setSubjectId] = useState('');
  const creating = id === 'new';
  const base = KINDS[kind].base;

  const item = useQuery({
    queryKey: studioKeys.item(kind, id),
    queryFn: () => api<ItemView<T>>(`/${base}/${id}`),
    enabled: session !== null && !creating,
  });
  const subjects = useQuery({
    queryKey: studioKeys.subjects,
    queryFn: () => api<SubjectView[]>('/curriculum/subjects'),
    enabled: session !== null && creating,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['studio'] });
  const save = useMutation({
    mutationFn: (content: T) =>
      creating
        ? api<ItemView<T>>(`/${base}`, 'POST', { subjectId, content })
        : api<ItemView<T>>(`/${base}/${id}/draft`, 'PUT', { content }),
    onSuccess: (view) => {
      client.setQueryData(studioKeys.item(kind, view.id), view);
      refresh();
      if (creating) {
        router.replace(`${KINDS[kind].editor}/${view.id}`);
      }
    },
  });

  if (!session) {
    return null;
  }
  if (!creating && !item.data) {
    return (
      <AdultShell session={session}>
        <LoadState failed={item.isError} />
      </AdultShell>
    );
  }
  const latest = item.data?.versions[0];
  const edit = editModeOf(session, latest);
  const needsSubject = creating && !subjectId;

  return (
    <AdultShell session={session}>
      <Link href="/content" className="font-semibold text-sky underline">
        ← {t('studio.heading')}
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold">
        {creating || !latest ? t(heading.create) : t(heading.edit)}
      </h1>
      <div className="mt-6">
        <EditingLocalePicker
          value={locale}
          onChange={(next) => isSupportedLocale(next) && setLocale(next)}
        />
      </div>
      {creating ? (
        <div className="mt-6">
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
        </div>
      ) : null}
      {edit.mode === 'locked' ? (
        <p className="mt-4 rounded-control bg-paper p-3">{t(edit.reason)}</p>
      ) : null}
      {edit.mode === 'newVersion' && !creating ? (
        <p className="mt-4 text-ink-soft">{t('studio.newVersionHint')}</p>
      ) : null}
      <div className="mt-6 rounded-sheet bg-sheet p-5 sm:p-8">
        <EditingLocale.Provider value={locale}>
          <Editor
            key={`${latest?.id}-${latest?.state}`}
            initial={latest?.content ?? null}
            disabled={edit.mode === 'locked' || needsSubject}
            saving={save.isPending}
            submitLabel={
              edit.mode === 'newVersion' && !creating
                ? t('studio.startNewVersion')
                : t('studio.saveDraft')
            }
            onSave={(content) => save.mutate(content)}
          />
        </EditingLocale.Provider>
      </div>
      <div className="mt-4">
        {needsSubject ? <p className="text-ink-soft">{t('studio.chooseSubjectFirst')}</p> : null}
        {save.isSuccess && !creating ? <FormNotice>{t('studio.saved')}</FormNotice> : null}
        {save.isError ? <FormAlert>{t(errorKey(save.error))}</FormAlert> : null}
      </div>
      {item.data ? (
        <VersionPanel
          kind={kind}
          session={session}
          versions={item.data.versions}
          onChanged={refresh}
        />
      ) : null}
    </AdultShell>
  );
}
