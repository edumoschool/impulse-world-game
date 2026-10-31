'use client';

import type {
  ChildSettings,
  ChildView,
  ConsentScope,
  ConsentView,
  UpdateChildSettingsRequest,
} from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { FormAlert, FormNotice } from './form-alert';

const AVATAR_COLORS = ['bg-coral', 'bg-mint', 'bg-sun', 'bg-violet text-white'];
const DAILY_LIMITS = [null, 30, 60, 90, 120] as const;

export function ChildPanel({ child, index }: { child: ChildView; index: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const age = new Date().getFullYear() - child.birthYear;

  return (
    <div className="rounded-sheet border-2 border-line bg-sheet">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span
          aria-hidden
          className={`grid size-14 shrink-0 place-items-center rounded-full font-display text-xl font-bold ${
            AVATAR_COLORS[index % AVATAR_COLORS.length]
          }`}
        >
          {child.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{child.displayName}</h2>
          <p className="text-sm text-ink-soft">
            {t('dashboard.ageYears', { age })},{' '}
            {t('dashboard.signsInAs', { username: child.username })}
          </p>
        </div>
        <button
          type="button"
          className="key key-quiet"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t('dashboard.manage', { name: child.displayName })}
        </button>
      </div>
      {open ? (
        <div className="grid gap-8 border-t-2 border-line p-5 sm:grid-cols-2">
          <SettingsForm child={child} />
          <ConsentList child={child} />
        </div>
      ) : null}
    </div>
  );
}

function SettingsForm({ child }: { child: ChildView }) {
  const t = useT();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (changes: UpdateChildSettingsRequest) =>
      api<ChildSettings>(`/children/${child.id}/settings`, 'PATCH', changes),
    // Shown at once, so a control responds to the click. It rolls back if the save fails.
    onMutate: async (changes) => {
      setSaved(false);
      await client.cancelQueries({ queryKey: ['children'] });
      const previous = client.getQueryData<ChildView[]>(['children']);
      client.setQueryData<ChildView[]>(['children'], (children) =>
        children?.map((entry) =>
          entry.id === child.id ? { ...entry, settings: { ...entry.settings, ...changes } } : entry,
        ),
      );
      return { previous };
    },
    onError: (_error, _changes, context) => {
      client.setQueryData(['children'], context?.previous);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['children'] });
      setSaved(true);
    },
  });

  const toggles: {
    key: 'aiTutorEnabled' | 'leaderboardsEnabled' | 'notificationsEnabled';
    label: MessageKey;
    hint?: MessageKey;
  }[] = [
    { key: 'aiTutorEnabled', label: 'settings.aiTutor', hint: 'settings.aiTutorHint' },
    {
      key: 'leaderboardsEnabled',
      label: 'settings.leaderboards',
      hint: 'settings.leaderboardsHint',
    },
    { key: 'notificationsEnabled', label: 'settings.notifications' },
  ];

  return (
    <section>
      <h3 className="font-display font-bold">{t('settings.heading')}</h3>
      <div className="mt-4 flex flex-col gap-4">
        <label className="block">
          <span className="font-semibold">{t('settings.dailyLimit')}</span>
          <select
            value={child.settings.dailyMinutesLimit ?? ''}
            disabled={save.isPending}
            onChange={(event) =>
              save.mutate({
                dailyMinutesLimit: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            className="mt-1.5 block min-h-11 w-full rounded-control border-2 border-ink bg-sheet px-3"
          >
            {DAILY_LIMITS.map((minutes) => (
              <option key={minutes ?? 'none'} value={minutes ?? ''}>
                {minutes === null
                  ? t('settings.dailyLimitNone')
                  : t('settings.dailyLimitMinutes', { minutes })}
              </option>
            ))}
          </select>
        </label>

        {toggles.map(({ key, label, hint }) => (
          <label key={key} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-sky"
              checked={child.settings[key]}
              onChange={(event) => save.mutate({ [key]: event.target.checked })}
            />
            <span>
              <span className="block font-semibold">{t(label)}</span>
              {hint ? <span className="text-sm text-ink-soft">{t(hint)}</span> : null}
            </span>
          </label>
        ))}

        {save.isError ? <FormAlert>{t(errorKey(save.error))}</FormAlert> : null}
        {saved && !save.isError ? <FormNotice>{t('settings.saved')}</FormNotice> : null}
      </div>
    </section>
  );
}

function ConsentList({ child }: { child: ChildView }) {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<string>();
  const key = ['consents', child.id];

  const consents = useQuery({
    queryKey: key,
    queryFn: () => api<ConsentView[]>(`/children/${child.id}/consents`),
  });
  const withdraw = useMutation({
    mutationFn: (consentId: string) => api(`/children/${child.id}/consents/${consentId}`, 'DELETE'),
    onSuccess: async () => {
      setConfirming(undefined);
      await client.invalidateQueries({ queryKey: key });
    },
  });

  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
  const scopeName = (scope: ConsentScope) => t(`consent.scope.${scope}` as MessageKey);

  return (
    <section>
      <h3 className="font-display font-bold">{t('consent.heading')}</h3>
      <ul className="mt-4 flex flex-col gap-4">
        {consents.data?.map((consent) => (
          <li key={consent.id}>
            <p className="font-semibold">{consent.scopes.map(scopeName).join(', ')}</p>
            <p className="text-sm text-ink-soft">
              {t('consent.policy', { version: consent.policyVersion })}
            </p>
            <p className="text-sm text-ink-soft">
              {consent.revokedAt
                ? t('consent.withdrawnOn', { date: date(consent.revokedAt) })
                : t('consent.givenOn', { date: date(consent.grantedAt) })}
            </p>
            {consent.revokedAt ? null : confirming === consent.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-sm">
                  {t('consent.withdrawConfirm', { name: child.displayName })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="key key-quiet"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate(consent.id)}
                  >
                    {t('consent.withdrawAction')}
                  </button>
                  <button
                    type="button"
                    className="key key-quiet"
                    onClick={() => setConfirming(undefined)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1 min-h-11 font-medium underline underline-offset-4"
                onClick={() => setConfirming(consent.id)}
              >
                {t('consent.withdraw')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {withdraw.isError ? <FormAlert>{t(errorKey(withdraw.error))}</FormAlert> : null}
    </section>
  );
}
