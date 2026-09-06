import { AuditLogType, DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity } from 'typeorm';

@Entity('audit_log')
@WithTimestamps()
export class AuditLogEntity extends DatabaseEntity {
  @Column({ type: 'varchar' })
  type: AuditLogType;

  @Column()
  action: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'resource_type', nullable: true })
  resourceType?: string;

  @Column({ name: 'resource_id', nullable: true })
  resourceId?: string;

  @Column({ nullable: true })
  decision?: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
