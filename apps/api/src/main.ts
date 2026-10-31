import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { loadRootEnvFile } from './config/app-config.js';
import { buildOpenApiDocument, configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  loadRootEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = configureApp(app);

  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApiDocument(app));
  }
  await app.listen(config.API_PORT);
}

await bootstrap();
