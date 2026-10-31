import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@impulse/contracts';
import type { Request, Response } from 'express';
import { RateLimiter, type RateLimitResult } from '../infrastructure/cache/rate-limiter.js';
import { AppError } from './app-error.js';
import { RATE_LIMIT_METADATA, type RateLimitRule } from './decorators.js';

const DEFAULT_RULE: RateLimitRule = { name: 'default', limit: 300, windowSeconds: 60 };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule =
      this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_RULE;

    const request = context.switchToHttp().getRequest<Request>();
    let result: RateLimitResult;
    try {
      result = await this.limiter.hit(`${rule.name}:${request.ip}`, rule.limit, rule.windowSeconds);
    } catch (err) {
      this.logger.error({ err, rule: rule.name }, 'Rate limiter unavailable');
      if (rule.failClosed) {
        throw AppError.unavailable();
      }
      return true;
    }

    if (!result.allowed) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', result.retryAfterSeconds);
      throw new AppError(ERROR_CODES.RATE_LIMITED, 429, 'Too many requests. Please slow down.');
    }
    return true;
  }
}
