import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/** Requiring a tenant id here makes a key shared between tenants impossible to build. */
export function tenantCacheKey(tenantId: string, ...parts: string[]): string {
  if (!tenantId) {
    throw new Error('A tenant id is required to build a cache key');
  }
  return ['tenant', tenantId, ...parts].join(':');
}

@Injectable()
export class TenantCache {
  constructor(private readonly redis: RedisService) {}

  async get<T>(tenantId: string, parts: string[]): Promise<T | null> {
    const value = await this.redis.client.get(tenantCacheKey(tenantId, ...parts));
    return value === null ? null : (JSON.parse(value) as T);
  }

  async set(tenantId: string, parts: string[], value: unknown, ttlSeconds: number): Promise<void> {
    const key = tenantCacheKey(tenantId, ...parts);
    await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delete(tenantId: string, parts: string[]): Promise<void> {
    await this.redis.client.del(tenantCacheKey(tenantId, ...parts));
  }
}
