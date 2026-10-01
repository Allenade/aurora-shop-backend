import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type DataRequestType = 'access' | 'delete';
export type DataRequestStatus =
  'open' | 'in_progress' | 'completed' | 'rejected';

@Entity('data_request')
@WithTimestamps()
export class DataRequestEntity extends DatabaseEntity {
  @Column({ type: 'varchar', length: 16 })
  type: DataRequestType;

  @Index()
  @Column({ name: 'subject_email', length: 254 })
  subjectEmail: string;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string | null;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: DataRequestStatus;

  @Column({ name: 'due_date', type: 'timestamptz' })
  dueDate: Date;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy?: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes?: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;
}
