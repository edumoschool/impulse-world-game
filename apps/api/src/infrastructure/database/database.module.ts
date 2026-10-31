import { Global, Module } from '@nestjs/common';
import { SystemDatabase } from './system-database.js';
import { TenantDatabase } from './tenant-database.js';

@Global()
@Module({
  providers: [TenantDatabase, SystemDatabase],
  exports: [TenantDatabase, SystemDatabase],
})
export class DatabaseModule {}
