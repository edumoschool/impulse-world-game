import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@impulse/contracts';
import { AppError } from '../../../common/app-error.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';

const MAX_FAILURES = 5;
const WINDOW_SECONDS = 15 * 60;

/**
 * Per-account lockout, which complements per-IP rate limiting. Child passcodes can be short, so
 * this is what makes guessing one impractical. Fails closed when Redis is unavailable.
 */
@Injectable()
export class LoginThrottle {
  constructor(private readonly redis: RedisService) {}

  async assertNotLocked(identifier: string): Promise<void> {
    const failures = await this.guarded(() => this.redis.client.get(keyFor(identifier)));
    if (Number(failures ?? 0) >= MAX_FAILURES) {
      throw new AppError(
        ERROR_CODES.ACCOUNT_LOCKED,
        429,
        'Too many failed attempts. Please try again later.',
      );
    }
  }

  async recordFailure(identifier: string): Promise<void> {
    const key = keyFor(identifier);
    await this.guarded(async () => {
      const failures = await this.redis.client.incr(key);
      if (failures === 1) {
        await this.redis.client.expire(key, WINDOW_SECONDS);
      }
    });
  }

  async clear(identifier: string): Promise<void> {
    await this.guarded(() => this.redis.client.del(keyFor(identifier)));
  }

  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw AppError.unavailable('Sign-in is temporarily unavailable');
    }
  }
}

/** Hashed so that Redis never holds an email address or a child's username. */
function keyFor(identifier: string): string {
  return `login-failures:${createHash('sha256').update(identifier).digest('hex')}`;
}
