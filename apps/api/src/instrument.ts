// Loaded with `node --import` so tracing wraps modules before they are first imported.
// Tracing and error reporting stay off until their environment variables are set.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';
import { loadRootEnvFile } from './config/app-config.js';
import { SENTRY_DATA_COLLECTION } from './infrastructure/telemetry/sentry-options.js';

loadRootEnvFile();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0,
  });
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: 'impulse-api',
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // File system spans are noise, and SQL statements could carry identifiers.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: false },
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
}
