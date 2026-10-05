import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';
import type { ConfirmationSource } from '../../payment-gateway/_contract/payment.types';
import { CORE_30_PROGRAM } from '../../program/core30';

export type EnterFirstPaymentStatus =
  'pending' | 'success' | 'failed' | 'refunded';

export type EnterFirstPriceLine = {
  slug: string;
  name: string;
  price: number;
  currency: string;
  isFree: boolean;
  enrollmentCutoff?: string | null;
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

  /** Program folder. Enter First / Core 3.0 enrollments are stored as Core 3.0. */
  @Index('IDX_enter_first_enrollment_program')
  @Column({ type: 'varchar', length: 80, default: CORE_30_PROGRAM })
  program: string;

  /** Unbounded varchar. Matches rows created before length limits were added. */
  @Column({ name: 'first_name', type: 'varchar' })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar' })
  lastName: string;

  @Index()
  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string;

  /** Selected track slugs from the course catalogue */
  @Column({ type: 'jsonb', default: [] })
  tracks: string[];

  /** Price charged, in major units, taken from the course table at enroll time. */
  @Column({ type: 'int', default: 0 })
  amount: number;

  @Column({ name: 'currency', type: 'varchar', default: 'NGN' })
  currency: string;

  @Column({ name: 'price_snapshot', type: 'jsonb', default: [] })
  priceSnapshot: EnterFirstPriceLine[];

  @Column({ name: 'payment_status', type: 'varchar', default: 'pending' })
  paymentStatus: EnterFirstPaymentStatus;

  @Index({ unique: true, where: '"paystack_reference" IS NOT NULL' })
  @Column({ name: 'paystack_reference', type: 'varchar', nullable: true })
  paystackReference?: string;

  @Column({ name: 'authorization_url', type: 'varchar', nullable: true })
  authorizationUrl?: string;

  @Column({
    name: 'paystack_transaction_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  paystackTransactionId?: string | null;

  @Column({ name: 'paid_amount', type: 'int', nullable: true })
  paidAmount?: number | null;

  @Column({ name: 'paid_currency', type: 'varchar', length: 8, nullable: true })
  paidCurrency?: string | null;

  @Column({
    name: 'paystack_channel',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  paystackChannel?: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({
    name: 'confirmation_source',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  confirmationSource?: ConfirmationSource | null;

  @Column({ name: 'amount_mismatch', type: 'boolean', default: false })
  amountMismatch: boolean;

  @Column({ name: 'currency_mismatch', type: 'boolean', default: false })
  currencyMismatch: boolean;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;

  /** Full form submission for admin detail view */
  @Column({ type: 'jsonb', default: {} })
  form: EnterFirstFormPayload;

  @Column({ name: 'email_sent_at', type: 'timestamptz', nullable: true })
  emailSentAt?: Date;

  @Column({
    name: 'terms_version',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  termsVersion?: string | null;

  @Column({
    name: 'privacy_version',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  privacyVersion?: string | null;

  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt?: Date | null;

  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn: boolean;

  @Column({ name: 'consent_ip', type: 'varchar', length: 64, nullable: true })
  consentIp?: string | null;

  @Column({
    name: 'consent_user_agent',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  consentUserAgent?: string | null;

  @Column({ name: 'age_confirmed', type: 'boolean', nullable: true })
  ageConfirmed?: boolean | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth?: string | null;

  @Column({ name: 'is_minor', type: 'boolean', nullable: true })
  isMinor?: boolean | null;

  @Column({
    name: 'guardian_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  guardianName?: string | null;

  @Column({
    name: 'guardian_email',
    type: 'varchar',
    length: 254,
    nullable: true,
  })
  guardianEmail?: string | null;

  @Column({ name: 'guardian_consent', type: 'boolean', nullable: true })
  guardianConsent?: boolean | null;

  @Column({ name: 'guardian_consent_at', type: 'timestamptz', nullable: true })
  guardianConsentAt?: Date | null;

  @Column({ name: 'anonymised_at', type: 'timestamptz', nullable: true })
  anonymisedAt?: Date | null;
}
