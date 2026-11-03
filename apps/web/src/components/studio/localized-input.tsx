'use client';

import type { LocalizedText } from '@impulse/contracts';
import { LOCALE_NAMES, SUPPORTED_LOCALES } from '@impulse/localization';
import { useId } from 'react';
import { useT } from '@/lib/i18n';
import { useEditingLocale } from '@/lib/studio';

interface Props {
  label: string;
  value: LocalizedText | undefined;
  onChange: (value: LocalizedText) => void;
  multiline?: boolean;
  required?: boolean;
}

/**
 * Edits one localized field in the editor's current language, and says which languages have
 * text, so an author can see at a glance what still needs translating.
 */
export function LocalizedInput({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
}: Props) {
  const t = useT();
  const id = useId();
  const locale = useEditingLocale();
  const current = value?.[locale] ?? '';
  const filled = SUPPORTED_LOCALES.filter((entry) => value?.[entry]?.trim());
  const set = (text: string) => onChange({ ...value, [locale]: text });
  const className = 'mt-1.5 w-full rounded-control border-2 border-ink bg-sheet px-4 py-2 text-lg';

  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label} <span className="font-normal text-ink-soft">({LOCALE_NAMES[locale]})</span>
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          className={className}
          value={current}
          onChange={(e) => set(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className={`${className} min-h-13`}
          value={current}
          onChange={(e) => set(e.target.value)}
        />
      )}
      <p className="mt-1 text-sm text-ink-soft">
        {filled.length === 0
          ? required
            ? t('studio.text.missing')
            : t('studio.text.optional')
          : t('studio.text.filled', {
              languages: filled.map((entry) => LOCALE_NAMES[entry]).join(', '),
            })}
      </p>
    </div>
  );
}

/** Chooses the language the whole editor writes in. */
export function EditingLocalePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (locale: string) => void;
}) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t('studio.editingLanguage')}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="font-semibold">{t('studio.editingLanguage')}</span>
      {SUPPORTED_LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={value === locale}
          onClick={() => onChange(locale)}
          className={`min-h-11 rounded-control border-2 px-3 font-medium ${
            value === locale ? 'border-sky bg-sky text-white' : 'border-ink bg-sheet'
          }`}
        >
          {LOCALE_NAMES[locale]}
        </button>
      ))}
    </div>
  );
}
