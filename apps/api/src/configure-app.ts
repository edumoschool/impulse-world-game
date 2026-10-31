import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { runWithRequestContext } from './common/request-context.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { resolveRequestId } from './infrastructure/telemetry/logging.js';

export const API_PREFIX = 'api/v1';
const BODY_LIMIT = '1mb';

/** Shared by main.ts and the integration tests, so tests exercise the real HTTP stack. */
export function configureApp(app: NestExpressApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.use(helmet());
  app.use(cookieParser());
  // Only the web origin may call with credentials. Nothing else needs cross-origin access.
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('x-request-id', requestId);
    runWithRequestContext(requestId, next);
  });
  app.enableShutdownHooks();
  return config;
}

export function buildOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('IMPULSE WORLD API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('iw_at')
      .build(),
  );
}
