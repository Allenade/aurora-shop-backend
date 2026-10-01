import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type RefundStatus =
  'requested' | 'approved' | 'rejected' | 'processed' | 'failed';

@Entity('refund_request')
@WithTimestamps()
export class RefundRequestEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'varchar', length: 16, default: 'requested' })
  status: RefundStatus;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy?: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null;

  @Column({ name: 'review_note', type: 'varchar', length: 500, nullable: true })
  reviewNote?: string | null;

  @Column({
    name: 'paystack_refund_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  paystackRefundId?: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null;

  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  failureReason?: string | null;
}
