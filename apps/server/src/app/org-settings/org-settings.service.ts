import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogType } from '@app/shared';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { UpdateOrganizationSettingsDto } from './dto/organization-settings.dto';
import { SettingEntity } from './entities/setting.entity';
import {
  ORGANIZATION_SETTING_DEFAULTS,
  ORGANIZATION_SETTING_KEY,
  type OrganizationSettings,
} from './organization-settings';

@Injectable()
export class OrgSettingsService {
  constructor(
    @InjectRepository(SettingEntity)
    private readonly settings: Repository<SettingEntity>,
    private readonly audit: AuditLogService,
  ) {}

  async get(): Promise<OrganizationSettings> {
    const row = await this.settings.findOne({
      where: { key: ORGANIZATION_SETTING_KEY },
    });
    return {
      ...ORGANIZATION_SETTING_DEFAULTS,
      ...(row?.value ?? {}),
    };
  }

  async update(dto: UpdateOrganizationSettingsDto, userId?: string) {
    const current = await this.get();
    const next: OrganizationSettings = { ...current, ...stripUndefined(dto) };
    let row = await this.settings.findOne({
      where: { key: ORGANIZATION_SETTING_KEY },
    });
    if (!row) {
      row = this.settings.create({
        key: ORGANIZATION_SETTING_KEY,
        value: next,
        updatedBy: userId ?? null,
      });
    } else {
      row.value = next;
      row.updatedBy = userId ?? null;
    }
    await this.settings.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'SETTINGS_UPDATED',
      userId,
      resourceType: 'settings',
      resourceId: ORGANIZATION_SETTING_KEY,
      metadata: { previous: current, next },
    });
    return next;
  }

  async ensureDefaults() {
    const existing = await this.settings.findOne({
      where: { key: ORGANIZATION_SETTING_KEY },
    });
    if (existing) return;
    await this.settings.save(
      this.settings.create({
        key: ORGANIZATION_SETTING_KEY,
        value: ORGANIZATION_SETTING_DEFAULTS,
      }),
    );
  }
}

function stripUndefined(
  dto: UpdateOrganizationSettingsDto,
): Partial<OrganizationSettings> {
  const out: Partial<OrganizationSettings> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
