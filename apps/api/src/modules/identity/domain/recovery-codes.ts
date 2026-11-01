import { createHmac, randomInt } from 'node:crypto';

/** No 0/o, 1/l/i: codes are often copied by hand from paper. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;

/** About 49 bits each. Login lockout limits online guessing, and the keyed hash offline guessing. */
export function generateRecoveryCode(): string {
  let code = '';
  for (let index = 0; index < LENGTH; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Case and separators do not matter, so "ABCDE FGHJK" and "abcde-fghjk" are the same code. */
export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(code: string, key: Buffer): string {
  return createHmac('sha256', key)
    .update(`mfa-recovery:${normalizeRecoveryCode(code)}`)
    .digest('hex');
}
