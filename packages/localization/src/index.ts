import { en, type MessageKey } from './messages/en.js';
import { ru } from './messages/ru.js';
import { uz } from './messages/uz.js';

export type { MessageKey };

export const SUPPORTED_LOCALES = ['uz', 'en', 'ru'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: SupportedLocale = 'en';

/** Autonyms: each language is shown in its own name, so people can find theirs. */
export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  uz: "O'zbekcha",
  en: 'English',
  ru: 'Русский',
};

const CATALOGS: Record<SupportedLocale, Partial<Record<MessageKey, string>>> = { en, ru, uz };

const RTL_LOCALES: readonly string[] = [];

/** No supported language is right-to-left yet. Layouts read this so that adding one is cheap. */
export function directionOf(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Picks the first supported language from a preference list, such as navigator.languages. */
export function negotiateLocale(preferred: readonly string[]): SupportedLocale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split('-')[0];
    if (isSupportedLocale(language)) {
      return language;
    }
  }
  return FALLBACK_LOCALE;
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function createTranslator(locale: SupportedLocale): Translate {
  const catalog = CATALOGS[locale];
  return (key, values) => {
    const template = catalog[key] ?? en[key];
    if (!values) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}
