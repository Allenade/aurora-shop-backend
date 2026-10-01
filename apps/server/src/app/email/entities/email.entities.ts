import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';
import type { EmailBlock, EmailKind } from '../email-blocks';
import type { AudienceFilter, AudienceSpec } from '../audience';

export type EmailMessageStatus =
  | 'queued'
  | 'sending'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'failed'
  | 'complained'
  | 'cancelled';

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type StoredAttachment = {
  filename: string;
  content?: string;
  path?: string;
};

@Entity('email_template')
@WithTimestamps()
export class EmailTemplateEntity extends DatabaseEntity {
  @Column()
  name: string;

  @Column()
  subject: string;

  @Column({ type: 'varchar', default: 'transactional' })
  kind: EmailKind;

  @Column({ type: 'jsonb', default: [] })
  blocks: EmailBlock[];

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

@Entity('email_segment')
@WithTimestamps()
export class EmailSegmentEntity extends DatabaseEntity {
  @Column()
  name: string;

  @Column({ type: 'jsonb', default: {} })
  filters: AudienceFilter;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;
}

@Entity('email_campaign')
@WithTimestamps()
export class EmailCampaignEntity extends DatabaseEntity {
  @Column()
  name: string;

  @Column()
  subject: string;

  @Column({ type: 'varchar', default: 'transactional' })
  kind: EmailKind;

  @Column({ type: 'varchar', default: 'draft' })
  status: CampaignStatus;

  @Column({ type: 'jsonb', default: [] })
  blocks: EmailBlock[];

  @Column({ type: 'jsonb', default: {} })
  audience: AudienceSpec;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt?: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ type: 'jsonb', default: {} })
  stats: Record<string, number>;
}

@Entity('email_message')
@WithTimestamps()
export class EmailMessageEntity extends DatabaseEntity {
  @Index()
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId?: string | null;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string | null;

  @Index()
  @Column({ name: 'to_email' })
  toEmail: string;

  @Column()
  subject: string;

  @Column({ type: 'text', default: '' })
  html: string;

  @Column({ name: 'text_body', type: 'text', default: '' })
  textBody: string;

  @Column({ type: 'varchar', default: 'transactional' })
  kind: EmailKind;

  @Index()
  @Column({ type: 'varchar', default: 'queued' })
  status: EmailMessageStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Index()
  @Column({ name: 'resend_id', type: 'varchar', nullable: true })
  resendId?: string | null;

  @Column({ name: 'idempotency_key', unique: true })
  idempotencyKey: string;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'jsonb', default: [] })
  attachments: StoredAttachment[];
}

@Entity('email_suppression')
@WithTimestamps()
export class EmailSuppressionEntity extends DatabaseEntity {
  @Column({ unique: true })
  email: string;

  @Column()
  reason: 'bounce' | 'complaint' | 'unsubscribe';
}
