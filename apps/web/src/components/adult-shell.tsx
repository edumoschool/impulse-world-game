'use client';

import type { SessionView } from '@impulse/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { useSignOut } from '@/lib/session';
import { LanguageSwitcher } from './language-switcher';
import { WorkspaceSwitcher } from './workspace-switcher';

/** Frame for signed-in adult pages: brand, workspace, language and sign-out. */
export function AdultShell({ session, children }: { session: SessionView; children: ReactNode }) {
  const t = useT();
  const signOut = useSignOut();

  return (
    <div className="min-h-dvh">
      <header className="bg-sky text-white">
        <div className="on-sky mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link href="/dashboard" className="font-display text-lg font-bold">
            IMPULSE WORLD
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <WorkspaceSwitcher session={session} />
            <LanguageSwitcher />
            <button type="button" onClick={() => void signOut()} className="key key-quiet text-ink">
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
