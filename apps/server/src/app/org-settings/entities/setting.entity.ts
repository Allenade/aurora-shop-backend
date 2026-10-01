import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('setting')
export class SettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  value: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;
}
