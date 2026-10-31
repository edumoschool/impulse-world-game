import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/[\s=]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Not base32');
    }
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** RFC 6238 with the defaults authenticator apps use: SHA-1, 6 digits, 30-second steps. */
export function totp(secret: string, stepOffset = 0): string {
  const step = BigInt(Math.floor(Date.now() / 1000 / 30) + stepOffset);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}
