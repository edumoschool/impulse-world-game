import { Module } from '@nestjs/common';
import { CONSUMER_MODULES, CORE_MODULES, PLATFORM_MODULES } from './app.module.js';

/**
 * What the worker process runs: platform services, the global domain modules, and every module
 * with an event consumer. Kept apart from worker.ts so tests can build it without starting it.
 */
@Module({ imports: [...PLATFORM_MODULES, ...CORE_MODULES, ...CONSUMER_MODULES] })
export class WorkerModule {}
