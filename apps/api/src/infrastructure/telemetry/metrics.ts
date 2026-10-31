import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsRegistry {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'API latency by route template',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly authFailures = new Counter({
    name: 'auth_failures_total',
    help: 'Rejected authentication attempts, for anomaly alerts',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsRegistry) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const stop = this.metrics.httpDuration.startTimer();
    res.on('finish', () => {
      // The route template keeps cardinality bounded and keeps ids out of metric labels.
      const route = (req.route as { path?: string } | undefined)?.path ?? 'unmatched';
      stop({ method: req.method, route, status: String(res.statusCode) });
    });
    next();
  }
}
