import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogEntry } from '@app/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { toAuditListItem, type AuditActorUser } from './audit-log.presenter';
import { AuditLogEntity } from './entities/audit-log.entity';

const SENSITIVE = /password|token|secret|otp|pin|key|cvv|card/i;

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.test(key) ? '[REDACTED]' : redact(raw);
  }
  return out;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  log(entry: AuditLogEntry) {
    void this.repo
      .save(
        this.repo.create({
          ...entry,
          ip: entry.ip?.slice(0, 64),
          userAgent: entry.userAgent?.slice(0, 512),
          requestId: entry.requestId?.slice(0, 80),
          metadata: entry.metadata
            ? (redact(entry.metadata) as Record<string, unknown>)
            : undefined,
        }),
      )
      .catch((error) => {
        this.logger.warn(`Failed to persist audit row: ${String(error)}`);
      });
  }

  async list(opts: {
    type?: string;
    action?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (opts.type) qb.andWhere('a.type = :type', { type: opts.type });
    if (opts.action) qb.andWhere('a.action = :action', { action: opts.action });
    if (opts.userId) qb.andWhere('a.userId = :userId', { userId: opts.userId });
    if (opts.resourceType) {
      qb.andWhere('a.resourceType = :resourceType', {
        resourceType: opts.resourceType,
      });
    }
    if (opts.resourceId) {
      qb.andWhere('a.resourceId = :resourceId', {
        resourceId: opts.resourceId,
      });
    }
    if (opts.from)
      qb.andWhere('a.createdAt >= :from', { from: new Date(opts.from) });
    if (opts.to) qb.andWhere('a.createdAt <= :to', { to: new Date(opts.to) });
    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const actors = await this.actorsFor(items);
    return {
      items: items.map((row) =>
        toAuditListItem(row, row.userId ? actors.get(row.userId) : null),
      ),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async actorsFor(rows: AuditLogEntity[]) {
    const ids = [
      ...new Set(
        rows.map((row) => row.userId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors = new Map<string, AuditActorUser>();
    if (!ids.length) return actors;
    const users = await this.users.find({
      where: { id: In(ids) },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    for (const user of users) {
      actors.set(user.id, {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    }
    return actors;
  }
}
