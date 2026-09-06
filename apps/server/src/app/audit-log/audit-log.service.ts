import { Injectable, Logger } from '@nestjs/common';
import type { AuditLogEntry } from '@app/shared';
import { AuditLogEntity } from './entities/audit-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
  ) {}

  log(entry: AuditLogEntry) {
    void this.repo
      .save(
        this.repo.create({
          ...entry,
          metadata: entry.metadata
            ? (redact(entry.metadata) as Record<string, unknown>)
            : undefined,
        }),
      )
      .catch((error) => {
        this.logger.warn(`Failed to persist audit row: ${String(error)}`);
      });
  }
}
