import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app-config.js';

/**
 * Paths that must never reach logs (spec section 31). Extend this list whenever a request or
 * log object gains a sensitive field.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'passcode',
  'token',
  'refreshToken',
  'accessToken',
  'mfaCode',
  'recoveryCode',
  'recoveryCodes',
  'email',
  'username',
  'displayName',
  '*.password',
  '*.newPassword',
  '*.passcode',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.mfaCode',
  '*.recoveryCode',
  '*.recoveryCodes',
  '*.email',
  '*.username',
  '*.displayName',
];

const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

/** Reuses a well-formed inbound id for tracing. Anything else is replaced, to prevent log forging. */
export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
}

export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      genReqId: (req: IncomingMessage) => resolveRequestId(req.headers['x-request-id']),
      serializers: {
        // The query string is left out, because it can carry tokens or identifiers.
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
