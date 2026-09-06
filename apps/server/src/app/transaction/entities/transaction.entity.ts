import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';
import {
  TransactionProvider,
  TransactionReason,
  TransactionStatus,
} from '../../payment-gateway/_contract/payment.types';

@Entity('transaction')
@WithTimestamps()
export class TransactionEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column()
  reference: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar' })
  status: TransactionStatus;

  @Column({ type: 'varchar' })
  provider: TransactionProvider;

  @Column({ type: 'varchar', default: TransactionReason.ORDER })
  reason: TransactionReason;

  @Column({ name: 'external_reference', nullable: true })
  externalReference?: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'authorization_url', nullable: true })
  authorizationUrl?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
