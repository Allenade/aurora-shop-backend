import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';
import type { EmailKind } from '../email-queue.policy';

export type EmailMessageStatus =
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'failed'
  | 'complained';

export type EmailCampaignStatus =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type EmailAudience = {
  kind: 'all' | 'filter' | 'explicit';
  tracks?: string[];
  paymentStatuses?: Array<'pending' | 'success' | 'failed' | 'refunded'>;
  pendingHours?: number;
  cohort?: string;
  createdFrom?: string;
  createdTo?: string;
  marketingOptIn?: boolean;
  enrollmentIds?: string[];
  emails?: string[];
  references?: string[];
};

export type EmailAttachment = {
  filename: string;
  url: string;
  contentType: string;
};

@Entity('email_template')
@WithTimestamps()
export class EmailTemplateEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column({ length: 80 })
  slug: string;

  @Column({ length: 160 })
  name: string;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'varchar', length: 20, default: 'transactional' })
  kind: EmailKind;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

@Entity('email_campaign')
@WithTimestamps()
export class EmailCampaignEntity extends DatabaseEntity {
  @Column({ length: 160 })
  name: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId?: string | null;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'varchar', length: 20 })
  kind: EmailKind;

  @Column({ type: 'jsonb', default: {} })
  audience: EmailAudience;

  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status: EmailCampaignStatus;

  @Column({ name: 'total_recipients', type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ type: 'jsonb', default: [] })
  attachments: EmailAttachment[];
}

@Entity('email_message')
@WithTimestamps()
export class EmailMessageEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId?: string | null;

  @Index()
  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string | null;

  @Column({ name: 'to_email', length: 254 })
  toEmail: string;

  @Column({ name: 'to_name', length: 160, default: '' })
  toName: string;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  html: string;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'varchar', length: 20 })
  kind: EmailKind;

  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status: EmailMessageStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Index()
  @Column({ name: 'resend_id', type: 'varchar', length: 80, nullable: true })
  resendId?: string | null;

  @Index({ unique: true })
  @Column({ name: 'idempotency_key', length: 80 })
  idempotencyKey: string;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt?: Date | null;

  @Column({ name: 'claim_token', type: 'varchar', length: 64, nullable: true })
  claimToken?: string | null;

  @Column({ type: 'jsonb', default: [] })
  attachments: EmailAttachment[];
}

@Entity('email_suppression')
@WithTimestamps()
export class EmailSuppressionEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column({ length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 32 })
  reason: 'hard_bounce' | 'complaint' | 'unsubscribe';
}
