import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hotp,
  matchTotp,
  totpStep,
} from './totp.js';

// RFC 6238 appendix B and RFC 4226 appendix D use this secret.
const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP', () => {
  it.each([
    [0n, '755224'],
    [1n, '287082'],
    [2n, '359152'],
    [9n, '520489'],
  ])('matches RFC 4226 test vector %s', (counter, expected) => {
    expect(hotp(rfcSecret, counter)).toBe(expected);
  });
});

describe('TOTP', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 SHA-1 vector at time %s, truncated to 6 digits', (time, expected) => {
    expect(hotp(rfcSecret, totpStep(time))).toBe(expected);
  });

  const secret = base32Encode(rfcSecret);
  const time = 1_700_000_000;
  const step = totpStep(time);
  const code = hotp(rfcSecret, step);

  it('accepts the current code and returns its step', () => {
    expect(matchTotp(secret, code, time, null)).toBe(step);
  });

  it('allows one step of clock drift', () => {
    expect(matchTotp(secret, code, time + 30, null)).toBe(step);
    expect(matchTotp(secret, code, time - 30, null)).toBe(step);
  });

  it('rejects a code from outside the drift window', () => {
    expect(matchTotp(secret, code, time + 120, null)).toBeNull();
  });

  it('refuses to accept the same code twice', () => {
    expect(matchTotp(secret, code, time, step)).toBeNull();
  });

  it('rejects a wrong code', () => {
    expect(matchTotp(secret, code === '000000' ? '111111' : '000000', time, null)).toBeNull();
  });
});

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const data = randomBytes(20);
    expect(base32Decode(base32Encode(data)).equals(data)).toBe(true);
  });

  it('generates secrets with 160 bits of entropy', () => {
    expect(base32Decode(generateTotpSecret())).toHaveLength(20);
  });
});

describe('secret encryption', () => {
  const key = randomBytes(32);

  it('round-trips and does not contain the plaintext', () => {
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(sealed, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produces different output each time', () => {
    expect(encryptSecret('value', key)).not.toEqual(encryptSecret('value', key));
  });

  it('rejects tampered data', () => {
    const [iv, tag] = encryptSecret('value', key).split('.');
    const forged = [iv, tag, Buffer.from('forged').toString('base64url')].join('.');
    expect(() => decryptSecret(forged, key)).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => decryptSecret(encryptSecret('value', key), randomBytes(32))).toThrow();
  });
});
