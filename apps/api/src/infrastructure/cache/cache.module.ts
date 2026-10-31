import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';
import { RedisService } from './redis.service.js';
import { TenantCache } from './tenant-cache.js';

@Global()
@Module({
  providers: [RedisService, RateLimiter, TenantCache],
  exports: [RedisService, RateLimiter, TenantCache],
})
export class CacheModule {}
