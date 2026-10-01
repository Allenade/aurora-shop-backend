import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type RefundStatus =
  'pending' | 'approved' | 'rejected' | 'processed' | 'failed';

@Entity('refund_request')
@WithTimestamps()
export class RefundRequestEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: RefundStatus;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote?: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy?: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy?: string | null;

  @Column({ name: 'paystack_refund_id', type: 'varchar', nullable: true })
  paystackRefundId?: string | null;
}
