'use client';

import { isSupportedLocale, LOCALE_NAMES, SUPPORTED_LOCALES } from '@impulse/localization';
import { useLocale, useLocaleStore, useT } from '@/lib/i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <label className={`inline-flex items-center gap-2 text-sm font-medium ${className}`}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isSupportedLocale(event.target.value)) {
            setLocale(event.target.value);
          }
        }}
        className="min-h-11 rounded-control border-2 border-current bg-transparent px-3 font-medium"
      >
        {SUPPORTED_LOCALES.map((option) => (
          <option key={option} value={option} className="text-ink">
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
