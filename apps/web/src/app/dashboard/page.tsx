'use client';

import type { ChildView } from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AddChildForm } from '@/components/add-child-form';
import { ChildPanel } from '@/components/child-panel';
import { LanguageSwitcher } from '@/components/language-switcher';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useRequireSession, useSignOut } from '@/lib/session';

export default function DashboardPage() {
  const t = useT();
  const session = useRequireSession('ADULT');
  const signOut = useSignOut();
  const [adding, setAdding] = useState(false);

  const children = useQuery({
    queryKey: ['children'],
    queryFn: () => api<ChildView[]>('/children'),
    enabled: session !== null,
  });

  if (!session) {
    return null;
  }
  const tenant = session.tenants.find((entry) => entry.tenantId === session.activeTenantId);

  return (
    <div className="min-h-dvh">
      <header className="bg-sky text-white">
        <div className="on-sky mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="font-display text-lg font-bold">IMPULSE WORLD</p>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button type="button" onClick={() => void signOut()} className="key key-quiet text-ink">
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-bold">{t('dashboard.heading')}</h1>
            <p className="mt-1 text-ink-soft">{session.user.displayName}</p>
          </div>
          {tenant ? (
            <div>
              <p className="text-sm text-ink-soft">{t('dashboard.familyCode')}</p>
              <p data-testid="family-code" className="font-display text-2xl font-bold">
                {tenant.loginCode}
              </p>
              <p className="text-sm text-ink-soft">{t('dashboard.familyCodeHelp')}</p>
            </div>
          ) : null}
        </div>

        <section className="mt-10">
          {children.isError ? <p role="alert">{t('dashboard.loadFailed')}</p> : null}

          {children.data?.length === 0 && !adding ? (
            <div className="py-6">
              <h2 className="font-display text-xl font-bold">{t('dashboard.empty.title')}</h2>
              <p className="mt-2 max-w-prose text-ink-soft">{t('dashboard.empty.lead')}</p>
            </div>
          ) : null}

          <ul className="flex flex-col gap-3">
            {children.data?.map((child, index) => (
              <li key={child.id}>
                <ChildPanel child={child} index={index} />
              </li>
            ))}
          </ul>

          <div className="mt-6">
            {adding ? (
              <AddChildForm onClose={() => setAdding(false)} />
            ) : (
              <button type="button" className="key" onClick={() => setAdding(true)}>
                {t('dashboard.addChild')}
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
