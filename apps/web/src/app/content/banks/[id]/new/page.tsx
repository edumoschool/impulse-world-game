'use client';

import type {
  QuestionBankView,
  QuestionDefinition,
  QuestionView,
  SkillView,
} from '@impulse/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdultShell } from '@/components/adult-shell';
import { FormAlert } from '@/components/form-alert';
import { EditingLocalePicker } from '@/components/studio/localized-input';
import { QuestionEditor } from '@/components/studio/question-editor';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { useRequireSession } from '@/lib/session';
import { EditingLocale, studioKeys } from '@/lib/studio';
import { isSupportedLocale, type SupportedLocale } from '@impulse/localization';

export default function NewQuestionPage() {
  const t = useT();
  const text = useLocalized();
  const router = useRouter();
  const client = useQueryClient();
  const { id: bankId } = useParams<{ id: string }>();
  const session = useRequireSession('ADULT');
  const [locale, setLocale] = useState<SupportedLocale>(useLocale());
  const [skillIds, setSkillIds] = useState<string[]>([]);

  const banks = useQuery({
    queryKey: studioKeys.banks,
    queryFn: () => api<QuestionBankView[]>('/question-banks'),
    enabled: session !== null,
  });
  const bank = banks.data?.find((entry) => entry.id === bankId);
  const skills = useQuery({
    queryKey: ['studio', 'skills', bank?.subjectId],
    queryFn: () => api<SkillView[]>(`/curriculum/skills?subjectId=${bank?.subjectId}`),
    enabled: bank !== undefined,
  });
  const create = useMutation({
    mutationFn: (definition: QuestionDefinition) =>
      api<QuestionView>(`/question-banks/${bankId}/questions`, 'POST', { definition, skillIds }),
    onSuccess: (question) => {
      void client.invalidateQueries({ queryKey: studioKeys.bank(bankId) });
      void client.invalidateQueries({ queryKey: studioKeys.banks });
      router.push(`/content/questions/${question.id}`);
    },
  });

  if (!session) {
    return null;
  }
  return (
    <AdultShell session={session}>
      <Link href={`/content/banks/${bankId}`} className="font-semibold text-sky underline">
        ← {bank ? text(bank.title) : t('studio.heading')}
      </Link>
      <h1 className="mt-4 font-display text-3xl font-bold">{t('studio.newQuestion')}</h1>
      <div className="mt-6">
        <EditingLocalePicker
          value={locale}
          onChange={(next) => isSupportedLocale(next) && setLocale(next)}
        />
      </div>
      {skills.data && skills.data.length > 0 ? (
        <fieldset className="mt-6">
          <legend className="font-semibold">{t('studio.question.skills')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {skills.data.map((skill) => (
              <label
                key={skill.id}
                className="flex min-h-11 items-center gap-2 rounded-control border-2 border-line bg-sheet px-3"
              >
                <input
                  type="checkbox"
                  className="size-5 accent-sky"
                  checked={skillIds.includes(skill.id)}
                  onChange={(event) =>
                    setSkillIds(
                      event.target.checked
                        ? [...skillIds, skill.id]
                        : skillIds.filter((s) => s !== skill.id),
                    )
                  }
                />
                {text(skill.title)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="mt-6 rounded-sheet bg-sheet p-5 sm:p-8">
        <EditingLocale.Provider value={locale}>
          <QuestionEditor
            initial={null}
            disabled={false}
            saving={create.isPending}
            submitLabel={t('studio.saveDraft')}
            onSave={(definition) => create.mutate(definition)}
          />
        </EditingLocale.Provider>
      </div>
      {create.isError ? (
        <div className="mt-4">
          <FormAlert>{t(errorKey(create.error))}</FormAlert>
        </div>
      ) : null}
    </AdultShell>
  );
}
