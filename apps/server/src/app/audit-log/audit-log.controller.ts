import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuditLogEntity } from './entities/audit-log.entity';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly rows: Repository<AuditLogEntity>,
  ) {}

  @Get()
  @RequirePermissions({ action: Action.LIST, resource: Resource.AUDIT })
  @ApiOperation({
    operationId: 'listAuditLogs',
    summary: 'List audit logs',
    description:
      'Admin views and changes. Filters: type, action, userId, resourceType, resourceId, from, to, page, limit.',
  })
  async list(
    @Query('type') type?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = Math.max(1, Number(pageRaw) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitRaw) || 25));
    const qb = this.rows
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (type) qb.andWhere('a.type = :type', { type });
    if (action) qb.andWhere('a.action = :action', { action });
    if (userId) qb.andWhere('a.userId = :userId', { userId });
    if (resourceType) {
      qb.andWhere('a.resourceType = :resourceType', { resourceType });
    }
    if (resourceId) qb.andWhere('a.resourceId = :resourceId', { resourceId });
    if (from) qb.andWhere('a.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('a.createdAt <= :to', { to: new Date(to) });
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        action: row.action,
        userId: row.userId ?? null,
        resourceType: row.resourceType ?? null,
        resourceId: row.resourceId ?? null,
        decision: row.decision ?? null,
        reason: row.reason ?? null,
        ip: row.ip ?? null,
        userAgent: row.userAgent ?? null,
        requestId: row.requestId ?? null,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      })),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
