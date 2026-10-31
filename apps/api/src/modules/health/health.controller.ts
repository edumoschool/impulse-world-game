import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { AppError } from '../../common/app-error.js';
import { Public } from '../../common/decorators.js';
import { RawResponse } from '../../common/response.interceptor.js';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { TenantDatabase } from '../../infrastructure/database/tenant-database.js';
import { MetricsRegistry } from '../../infrastructure/telemetry/metrics.js';

@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(
    private readonly database: TenantDatabase,
    private readonly redis: RedisService,
    private readonly metrics: MetricsRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The process is up. Used for restart decisions, so it checks no dependencies. */
  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  /** Whether this instance can serve traffic. Used to route load balancer traffic. */
  @Public()
  @Get('health/ready')
  async ready() {
    try {
      await Promise.all([this.database.global.$queryRaw`SELECT 1`, this.redis.client.ping()]);
    } catch {
      throw AppError.unavailable('Dependencies are not ready');
    }
    return { status: 'ok' };
  }

  @Public()
  @RawResponse()
  @Get('metrics')
  async prometheus(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.isMetricsToken(authorization)) {
      throw AppError.unauthenticated();
    }
    res.type(this.metrics.registry.contentType).send(await this.metrics.registry.metrics());
  }

  private isMetricsToken(header: string | undefined): boolean {
    const expected = Buffer.from(`Bearer ${this.config.METRICS_TOKEN}`);
    const received = Buffer.from(header ?? '');
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}
