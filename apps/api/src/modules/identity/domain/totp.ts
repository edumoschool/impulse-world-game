import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of encoded) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid base32 input');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP with SHA-1, which is what authenticator apps use for TOTP. */
export function hotp(secret: Buffer, counter: bigint): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totpStep(unixSeconds: number): bigint {
  return BigInt(Math.floor(unixSeconds / STEP_SECONDS));
}

/**
 * Returns the matching time step, allowing one step of clock drift either way. A step at or
 * before `lastUsedStep` is refused, so a code cannot be replayed within its validity window.
 */
export function matchTotp(
  secretBase32: string,
  code: string,
  unixSeconds: number,
  lastUsedStep: bigint | null,
): bigint | null {
  const secret = base32Decode(secretBase32);
  const current = totpStep(unixSeconds);
  for (const step of [current - 1n, current, current + 1n]) {
    if (lastUsedStep !== null && step <= lastUsedStep) {
      continue;
    }
    if (hotp(secret, step) === code) {
      return step;
    }
  }
  return null;
}

export function otpauthUri(secretBase32: string, accountLabel: string): string {
  const label = encodeURIComponent(`IMPULSE WORLD:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=IMPULSE%20WORLD&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/** AES-256-GCM. The output is `iv.tag.ciphertext` in base64url. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(sealed: string, key: Buffer): string {
  const [iv, tag, ciphertext] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) {
    throw new Error('Malformed encrypted value');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
