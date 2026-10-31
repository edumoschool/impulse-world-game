'use client';

import type { ChildView } from '@impulse/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AddChildForm } from '@/components/add-child-form';
import { AdultShell } from '@/components/adult-shell';
import { ChildPanel } from '@/components/child-panel';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useRequireSession } from '@/lib/session';

export default function DashboardPage() {
  const t = useT();
  const session = useRequireSession('ADULT');
  const [adding, setAdding] = useState(false);

  const children = useQuery({
    // A workspace switch resets this query, so it never shows another workspace's children.
    queryKey: ['children'],
    queryFn: () => api<ChildView[]>('/children'),
    enabled: session !== null,
  });

  if (!session) {
    return null;
  }
  const tenant = session.tenants.find((entry) => entry.tenantId === session.activeTenantId);
  // Display only. The API checks the permission again when the form is sent.
  const canAddChild = session.permissions.includes('children.provision');

  return (
    <AdultShell session={session}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold">{t('dashboard.heading')}</h1>
          <p className="mt-1 text-ink-soft">
            {tenant
              ? `${session.user.displayName} · ${tenant.tenantName}`
              : session.user.displayName}
          </p>
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

        {canAddChild ? (
          <div className="mt-6">
            {adding ? (
              <AddChildForm onClose={() => setAdding(false)} />
            ) : (
              <button type="button" className="key" onClick={() => setAdding(true)}>
                {t('dashboard.addChild')}
              </button>
            )}
          </div>
        ) : null}
      </section>

      <nav className="mt-14 flex flex-wrap gap-x-6 gap-y-3 border-t-2 border-ink/10 pt-6">
        <Link href="/security" className="font-medium underline underline-offset-4">
          {t('dashboard.security')}
        </Link>
        <Link href="/invitations/accept" className="font-medium underline underline-offset-4">
          {t('dashboard.joinInvitation')}
        </Link>
      </nav>
    </AdultShell>
  );
}
