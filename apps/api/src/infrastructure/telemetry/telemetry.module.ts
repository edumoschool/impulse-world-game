import { Global, Module } from '@nestjs/common';
import { HttpMetricsMiddleware, MetricsRegistry } from './metrics.js';

@Global()
@Module({
  providers: [MetricsRegistry, HttpMetricsMiddleware],
  exports: [MetricsRegistry, HttpMetricsMiddleware],
})
export class TelemetryModule {}
