import { describe, expect, it } from 'vitest';
import { renderEmail } from './email-templates.js';

describe('renderEmail', () => {
  const values = { link: 'https://example.test/x', organization: 'Sunrise', code: 'abc.def' };

  it('fills every placeholder in each language', () => {
    for (const locale of ['en', 'ru', 'uz']) {
      for (const template of ['passwordReset', 'invitation'] as const) {
        const message = renderEmail(template, locale, 'a@example.test', values);
        expect(`${message.subject}\n${message.text}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('uses the recipient language', () => {
    expect(renderEmail('passwordReset', 'ru', 'a@example.test', values).subject).toMatch(/пароля/);
  });

  it('falls back to English for an unknown language', () => {
    expect(renderEmail('invitation', 'fr', 'a@example.test', values).subject).toBe(
      'You are invited to join Sunrise on IMPULSE WORLD',
    );
  });
});
