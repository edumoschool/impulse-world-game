'use client';

import {
  createTranslator,
  directionOf,
  FALLBACK_LOCALE,
  isSupportedLocale,
  negotiateLocale,
  type SupportedLocale,
} from '@impulse/localization';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';

const STORAGE_KEY = 'iw-locale';

interface LocaleStore {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

/** Starts on the fallback so server and first client render match, then resolves in an effect. */
export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: FALLBACK_LOCALE,
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage can be blocked. The choice still applies for this visit.
    }
    set({ locale });
  },
}));

export function useResolveLocale(): void {
  const locale = useLocaleStore((state) => state.locale);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked, so the browser preference is used instead.
    }
    useLocaleStore.setState({
      locale: isSupportedLocale(stored) ? stored : negotiateLocale(navigator.languages),
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);
}

export function useT() {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => createTranslator(locale), [locale]);
}

export function useLocale(): SupportedLocale {
  return useLocaleStore((state) => state.locale);
}
