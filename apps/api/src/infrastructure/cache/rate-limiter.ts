import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { RedisService } from './redis.service.js';

// Atomic, so concurrent requests across API replicas cannot both take the last slot.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('TTL', KEYS[1]) }
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Fixed-window counter. Throws when Redis is unreachable, and the caller picks the fail mode. */
@Injectable()
export class RateLimiter {
  constructor(
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const effectiveLimit = Math.ceil(limit * this.config.RATE_LIMIT_MULTIPLIER);
    const [count, ttl] = (await this.redis.client.eval(
      HIT_SCRIPT,
      1,
      `ratelimit:${key}`,
      windowSeconds,
    )) as [number, number];
    return {
      allowed: count <= effectiveLimit,
      remaining: Math.max(0, effectiveLimit - count),
      retryAfterSeconds: Math.max(0, ttl),
    };
  }
}
