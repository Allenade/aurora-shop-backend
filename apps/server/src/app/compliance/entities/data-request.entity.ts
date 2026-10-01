import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity } from 'typeorm';

export type DataRequestType = 'access' | 'delete';
export type DataRequestStatus =
  'open' | 'in_progress' | 'completed' | 'rejected';

@Entity('data_request')
@WithTimestamps()
export class DataRequestEntity extends DatabaseEntity {
  @Column({ type: 'varchar' })
  type: DataRequestType;

  @Column({ name: 'subject_email' })
  subjectEmail: string;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string | null;

  @Column({ type: 'varchar', default: 'open' })
  status: DataRequestStatus;

  @Column({ name: 'due_at', type: 'timestamptz' })
  dueAt: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy?: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date | null;
}
