import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditLog } from './audit-log.js';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditLog],
  exports: [AuditLog],
})
export class AuditModule {}
