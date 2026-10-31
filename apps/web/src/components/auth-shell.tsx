'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';
import { LanguageSwitcher } from './language-switcher';
import { WorldMap } from './world-map';

/** The star chart holds the left of the screen, and on phones a short band above the form. */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();

  return (
    <div className="min-h-dvh bg-sky lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-sky relative flex flex-col gap-6 overflow-hidden px-6 pt-6 pb-16 text-white lg:h-dvh lg:sticky lg:top-0 lg:px-12 lg:py-10">
        <div className="flex items-start justify-between gap-4">
          <p className="font-display text-2xl leading-[1.05] font-bold lg:text-[2.75rem]">
            IMPULSE
            <br />
            WORLD
          </p>
          <LanguageSwitcher />
        </div>
        <div className="hidden min-h-0 flex-1 items-center justify-center lg:flex">
          <WorldMap />
        </div>
        <p className="text-lg font-medium lg:text-xl">{t('app.tagline')}</p>
      </aside>

      <main className="-mt-8 rounded-t-sheet bg-paper px-6 pt-10 pb-16 lg:mt-0 lg:flex lg:min-h-dvh lg:items-center lg:rounded-t-none lg:rounded-l-sheet lg:px-16">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
