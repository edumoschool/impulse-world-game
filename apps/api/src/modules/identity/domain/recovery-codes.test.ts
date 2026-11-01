import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from './recovery-codes.js';

describe('recovery codes', () => {
  it('are two groups of five unambiguous characters', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateRecoveryCode()).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
    }
  });

  it('ignore case and separators', () => {
    const key = randomBytes(32);
    expect(normalizeRecoveryCode(' ABCDE fghjk ')).toBe('abcdefghjk');
    expect(hashRecoveryCode('ABCDE FGHJK', key)).toBe(hashRecoveryCode('abcde-fghjk', key));
  });

  it('hash differently under a different key', () => {
    expect(hashRecoveryCode('abcde-fghjk', randomBytes(32))).not.toBe(
      hashRecoveryCode('abcde-fghjk', randomBytes(32)),
    );
  });
});
