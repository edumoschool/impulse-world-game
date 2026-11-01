import { z } from 'zod';
import { LOCALES, type Locale } from './common.js';

/** Spec 8.4. Rejection returns a version to DRAFT. */
export const CONTENT_STATES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'] as const;
export const contentStateSchema = z.enum(CONTENT_STATES);
export type ContentState = z.infer<typeof contentStateSchema>;

export const CONTENT_ACTIONS = ['submit', 'approve', 'reject', 'publish', 'archive'] as const;
export const contentActionSchema = z.enum(CONTENT_ACTIONS);
export type ContentAction = z.infer<typeof contentActionSchema>;

/**
 * Text in one or more of the supported languages, such as {"uz": "...", "en": "..."}.
 * At least one language must be present, and none may be blank.
 */
export const localizedTextSchema = z
  .partialRecord(z.enum(LOCALES), z.string().trim().min(1).max(4000))
  .refine((value) => Object.keys(value).length > 0, 'At least one language is required');
export type LocalizedText = Partial<Record<Locale, string>>;

const FALLBACK_ORDER: readonly Locale[] = ['en', 'uz', 'ru'];

/** The requested language if present, then English, Uzbek and Russian. */
export function pickLocalized(text: LocalizedText, locale: Locale): string {
  for (const candidate of [locale, ...FALLBACK_ORDER]) {
    const value = text[candidate];
    if (value) {
      return value;
    }
  }
  return '';
}
