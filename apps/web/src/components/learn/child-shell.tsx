'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useT } from '@/lib/i18n';
import { useSignOut } from '@/lib/session';

/**
 * Frame for a child's learning pages: a sky bar with the way home, and the content on paper,
 * which reads better than white on blue for longer text.
 */
export function ChildShell({ children, home = true }: { children: ReactNode; home?: boolean }) {
  const t = useT();
  const signOut = useSignOut();

  return (
    <div className="min-h-dvh">
      <header className="bg-sky text-white">
        <div className="on-sky mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          {home ? (
            <Link href="/play" className="key key-quiet text-ink">
              ← {t('learn.home')}
            </Link>
          ) : (
            <p className="font-display text-lg font-bold">IMPULSE WORLD</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <button type="button" onClick={() => void signOut()} className="key key-quiet text-ink">
              {t('common.signOut')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

/** A plain status line for loading and failure, announced to screen readers. */
export function LoadState({ failed }: { failed: boolean }) {
  const t = useT();
  return failed ? (
    <p role="alert" className="text-lg">
      {t('learn.loadFailed')}
    </p>
  ) : (
    <p role="status" className="text-ink-soft">
      {t('common.loading')}
    </p>
  );
}
