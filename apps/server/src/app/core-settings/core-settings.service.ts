import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType } from '@app/shared';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  DEFAULT_CORE_SETTINGS,
  type CoreSettingsValue,
} from './core-settings.types';
import type { UpdateCoreSettingsDto } from './dto/update-core-settings.dto';
import { SettingEntity } from './entities/setting.entity';

const KEY = 'core';

@Injectable()
export class CoreSettingsService {
  constructor(
    @InjectRepository(SettingEntity)
    private readonly rows: Repository<SettingEntity>,
    private readonly audit: AuditLogService,
  ) {}

  async get(): Promise<CoreSettingsValue> {
    const row = await this.rows.findOne({ where: { key: KEY } });
    return { ...DEFAULT_CORE_SETTINGS, ...(row?.value ?? {}) };
  }

  async update(patch: UpdateCoreSettingsDto, actorId?: string) {
    const current = await this.get();
    const next: CoreSettingsValue = { ...current, ...stripEmpty(patch) };
    let row = await this.rows.findOne({ where: { key: KEY } });
    if (!row) {
      row = this.rows.create({ key: KEY, value: next });
    } else {
      row.value = next;
    }
    await this.rows.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'SETTINGS_UPDATED',
      userId: actorId,
      resourceType: 'setting',
      resourceId: row.id,
      metadata: patch as Record<string, unknown>,
    });
    return next;
  }
}

function stripEmpty(patch: UpdateCoreSettingsDto): Partial<CoreSettingsValue> {
  const out: Partial<CoreSettingsValue> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
