'use client';

import { LanguageSwitcher } from '@/components/language-switcher';
import { WorldMap } from '@/components/world-map';
import { useT } from '@/lib/i18n';
import { useRequireSession, useSignOut } from '@/lib/session';

/** The child's landing screen. The worlds themselves arrive in Stage 5. */
export default function PlayPage() {
  const t = useT();
  const session = useRequireSession('CHILD');
  const signOut = useSignOut();

  if (!session) {
    return <div className="min-h-dvh bg-sky" />;
  }
  return (
    <div className="on-sky flex min-h-dvh flex-col gap-6 bg-sky px-6 py-6 text-white lg:px-12">
      <header className="flex items-center justify-between gap-4">
        <p className="font-display text-xl font-bold">IMPULSE WORLD</p>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <button type="button" onClick={() => void signOut()} className="key key-quiet text-ink">
            {t('common.signOut')}
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 lg:flex-row lg:gap-16">
        <div className="max-w-md">
          <h1 className="font-display text-4xl leading-tight font-bold lg:text-5xl">
            {t('play.greeting', { name: session.user.displayName })}
          </h1>
          <p className="mt-4 text-lg">{t('play.lead')}</p>
        </div>
        <div className="h-[28rem] w-full max-w-sm lg:h-[34rem]">
          <WorldMap />
        </div>
      </main>
    </div>
  );
}
