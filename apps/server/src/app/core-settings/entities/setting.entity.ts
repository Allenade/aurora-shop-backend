import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity } from 'typeorm';
import type { CoreSettingsValue } from '../core-settings.types';

@Entity('setting')
@WithTimestamps()
export class SettingEntity extends DatabaseEntity {
  @Column({ unique: true })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  value: Partial<CoreSettingsValue>;
}
