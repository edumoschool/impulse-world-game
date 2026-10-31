import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// The library's Algorithm enum is a const enum, which isolatedModules cannot read. 2 is Argon2id.
const ARGON2ID = 2;

// OWASP's recommended Argon2id baseline: 19 MiB memory, 2 iterations, 1 degree of parallelism.
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordHasher {
  /** Verified against for unknown accounts, so that they cost the same time as real ones. */
  private readonly dummyHash = hash('impulse-world-timing-equaliser', OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /** Spends the same effort as `verify` and always fails. */
  async verifyDummy(password: string): Promise<false> {
    await verify(await this.dummyHash, password);
    return false;
  }
}
