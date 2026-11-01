import {
  createTranslator,
  FALLBACK_LOCALE,
  isSupportedLocale,
  type MessageKey,
} from '@impulse/localization';
import type { EmailMessage } from './email-sender.js';

const TEMPLATES = {
  passwordReset: { subject: 'email.reset.subject', text: 'email.reset.body' },
  invitation: { subject: 'email.invite.subject', text: 'email.invite.body' },
} as const satisfies Record<string, { subject: MessageKey; text: MessageKey }>;

export type EmailTemplate = keyof typeof TEMPLATES;

/** Builds a message in the recipient's language from the shared catalogue, with English fallback. */
export function renderEmail(
  template: EmailTemplate,
  locale: string | null | undefined,
  to: string,
  values: Record<string, string>,
): EmailMessage {
  const t = createTranslator(isSupportedLocale(locale) ? locale : FALLBACK_LOCALE);
  const keys = TEMPLATES[template];
  return { to, subject: t(keys.subject, values), text: t(keys.text, values) };
}
