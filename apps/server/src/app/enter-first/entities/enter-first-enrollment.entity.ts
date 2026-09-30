import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type EnterFirstPaymentStatus =
  'pending' | 'success' | 'failed' | 'refunded';

export type EnterFirstFormPayload = {
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: string;
  nationality?: string;
  stateOfResidence?: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  currentStatus?: string;
  institution?: string;
  experienceLevel?: string;
  howDidYouHear?: string;
  joinedCommunity?: string;
  [key: string]: string | undefined;
};

@Entity('enter_first_enrollment')
@WithTimestamps()
export class EnterFirstEnrollmentEntity extends DatabaseEntity {
  @Column({ name: 'source', type: 'varchar', default: 'enter_first' })
  source: 'enter_first';

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Index()
  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string;

  /** Selected track ids from the website form */
  @Column({ type: 'jsonb', default: [] })
  tracks: string[];

  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ name: 'payment_status', type: 'varchar', default: 'pending' })
  paymentStatus: EnterFirstPaymentStatus;

  @Index({ unique: true, where: '"paystack_reference" IS NOT NULL' })
  @Column({ name: 'paystack_reference', type: 'varchar', nullable: true })
  paystackReference?: string;

  @Column({ name: 'authorization_url', type: 'varchar', nullable: true })
  authorizationUrl?: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;

  /** Full form submission for admin detail view */
  @Column({ type: 'jsonb', default: {} })
  form: EnterFirstFormPayload;

  @Column({ name: 'email_sent_at', type: 'timestamptz', nullable: true })
  emailSentAt?: Date;
}
