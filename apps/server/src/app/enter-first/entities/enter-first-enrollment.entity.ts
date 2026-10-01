import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type EnterFirstPaymentStatus =
  'pending' | 'success' | 'failed' | 'refunded';

export type PaymentConfirmationSource = 'webhook' | 'poll' | 'admin';

export type ChargedLine = {
  slug: string;
  name: string;
  price: number;
  currency: string;
};

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

  @Column({ name: 'terms_version', type: 'varchar', nullable: true })
  termsVersion?: string | null;

  @Column({ name: 'privacy_version', type: 'varchar', nullable: true })
  privacyVersion?: string | null;

  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt?: Date | null;

  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn: boolean;

  @Column({ name: 'consent_ip', type: 'varchar', nullable: true })
  consentIp?: string | null;

  @Column({ name: 'consent_user_agent', type: 'varchar', nullable: true })
  consentUserAgent?: string | null;

  @Column({ name: 'age_confirmed', type: 'boolean', default: false })
  ageConfirmed: boolean;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: string | null;

  @Column({ name: 'guardian_name', type: 'varchar', nullable: true })
  guardianName?: string | null;

  @Column({ name: 'guardian_email', type: 'varchar', nullable: true })
  guardianEmail?: string | null;

  @Column({ name: 'guardian_consent', type: 'boolean', default: false })
  guardianConsent: boolean;

  @Column({ name: 'charged_lines', type: 'jsonb', default: [] })
  chargedLines: ChargedLine[];

  @Column({ type: 'jsonb', default: [] })
  cohorts: string[];

  @Column({ name: 'paystack_transaction_id', type: 'varchar', nullable: true })
  paystackTransactionId?: string | null;

  @Column({ name: 'paid_amount', type: 'int', nullable: true })
  paidAmount?: number | null;

  @Column({ name: 'paid_currency', type: 'varchar', nullable: true })
  paidCurrency?: string | null;

  @Column({ name: 'payment_channel', type: 'varchar', nullable: true })
  paymentChannel?: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ name: 'confirmed_via', type: 'varchar', nullable: true })
  confirmedVia?: PaymentConfirmationSource | null;

  @Column({ name: 'reconciliation_exception', type: 'varchar', nullable: true })
  reconciliationException?: string | null;
}
