import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuditLogService } from './audit-log.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.AUDIT })
  @ApiOperation({
    operationId: 'listAuditLogs',
    summary: 'List audit logs',
    description:
      'Each row includes actor (id, email, name), action, timestamp, ip, userAgent, and requestId, plus type, userId, resourceType, resourceId, decision, reason, metadata, and createdAt. Filters: type, action, userId, resourceType, resourceId, from, to, page, limit.',
  })
  list(
    @Query('type') type?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.list({
      type,
      action,
      userId,
      resourceType,
      resourceId,
      from,
      to,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }
}
