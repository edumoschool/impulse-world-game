import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  directionOf,
  negotiateLocale,
  type SupportedLocale,
  SUPPORTED_LOCALES,
} from './index.js';
import { en } from './messages/en.js';
import { ru } from './messages/ru.js';
import { uz } from './messages/uz.js';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe.each([
  ['ru', ru],
  ['uz', uz],
])('%s catalogue', (_locale, catalog) => {
  it('has exactly the English keys', () => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps every placeholder, so no value goes missing in translation', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(catalog[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('has no empty strings', () => {
    expect(Object.values(catalog).filter((value) => value.trim() === '')).toEqual([]);
  });
});

describe('createTranslator', () => {
  it.each(SUPPORTED_LOCALES)('fills in values for %s', (locale: SupportedLocale) => {
    expect(createTranslator(locale)('play.greeting', { name: 'Ana' })).toContain('Ana');
  });

  it('leaves an unknown placeholder visible rather than hiding a bug', () => {
    expect(createTranslator('en')('play.greeting')).toBe('Hello, {name}');
  });
});

describe('negotiateLocale', () => {
  it('uses the first supported language', () => {
    expect(negotiateLocale(['fr-FR', 'ru-RU', 'en'])).toBe('ru');
  });

  it('falls back when nothing matches', () => {
    expect(negotiateLocale(['fr', 'de'])).toBe('en');
    expect(negotiateLocale([])).toBe('en');
  });
});

describe('directionOf', () => {
  it('treats all current languages as left to right', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(directionOf(locale)).toBe('ltr');
    }
  });
});
