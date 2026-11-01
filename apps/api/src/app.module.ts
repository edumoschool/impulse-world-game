import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { CacheModule } from './infrastructure/cache/cache.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { EmailModule } from './infrastructure/email/email-sender.js';
import { EventsModule } from './infrastructure/events/events.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { loggerParams } from './infrastructure/telemetry/logging.js';
import { HttpMetricsMiddleware } from './infrastructure/telemetry/metrics.js';
import { TelemetryModule } from './infrastructure/telemetry/telemetry.module.js';
import { AuditModule } from './modules/audit/index.js';
import { ChildrenModule } from './modules/children/index.js';
import { CurriculumModule } from './modules/curriculum/index.js';
import { LessonsModule } from './modules/lessons/index.js';
import { QuestionsModule } from './modules/questions/index.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthGuard, IdentityModule } from './modules/identity/index.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { OrganizationsModule } from './modules/organizations/index.js';
import { TenantsModule } from './modules/tenants/index.js';

/** Infrastructure shared by the API and the worker. */
export const PLATFORM_MODULES = [
  ConfigModule,
  LoggerModule.forRootAsync({
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => loggerParams(config),
  }),
  DatabaseModule,
  CacheModule,
  StorageModule,
  EmailModule,
  EventsModule,
  TelemetryModule,
];

@Module({
  imports: [
    ...PLATFORM_MODULES,
    AuditModule,
    IdentityModule,
    TenantsModule,
    OrganizationsModule,
    ChildrenModule,
    CurriculumModule,
    QuestionsModule,
    LessonsModule,
    OnboardingModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Rate limiting runs first, so requests that would fail auth still count against the limit.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*path');
  }
}
