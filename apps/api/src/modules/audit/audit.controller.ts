import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { paginationQuerySchema, type PaginationQuery } from '@impulse/contracts';
import { CurrentTenantActor, RequirePermissions } from '../../common/decorators.js';
import { Paginated, toSkipTake } from '../../common/paginated.js';
import type { TenantActor } from '../../common/request-context.js';
import { ZodQuery } from '../../common/zod.js';
import { TenantDatabase } from '../../infrastructure/database/tenant-database.js';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly database: TenantDatabase) {}

  @Get()
  @RequirePermissions('organization.view_audit_logs')
  list(
    @CurrentTenantActor() actor: TenantActor,
    @ZodQuery(paginationQuerySchema) query: PaginationQuery,
  ) {
    return this.database.run({ tenantId: actor.tenantId, userId: actor.userId }, async (tx) => {
      const [items, total] = await Promise.all([
        tx.auditLog.findMany({ orderBy: { occurredAt: 'desc' }, ...toSkipTake(query) }),
        tx.auditLog.count(),
      ]);
      return new Paginated(items, total, query.page, query.pageSize);
    });
  }
}
