import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType, type EnvTypes } from '@app/shared';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CourseEntity } from '../course/entities/course.entity';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { OpsHeartbeatService } from '../ops/ops-heartbeat.service';
import { StorageService } from '../storage/storage.service';
import {
  parseAudience,
  resolveAudience,
  type AudienceEnrollment,
  type AudienceFilter,
  type AudienceSpec,
} from './audience';
import type { EmailBlock, EmailKind } from './email-blocks';
import { EmailQueueService, type EmailJob } from './email-queue.service';
import {
  EMAIL_BATCH_SIZE,
  EMAIL_MAX_ATTEMPTS,
  backoffMs,
  batchIdempotencyKey,
} from './email-queue.policy';
import { renderEmail } from './email-render';
import {
  EmailCampaignEntity,
  EmailMessageEntity,
  EmailSegmentEntity,
  EmailSuppressionEntity,
  EmailTemplateEntity,
  type StoredAttachment,
} from './entities/email.entities';
import { assertImageFile, compressImage } from './image-processor';
import { verifyResendSignature } from './resend-signature';
import { signUnsubscribe, verifyUnsubscribe } from './unsubscribe-token';

const BLOCK_TYPES = new Set([
  'heading',
  'text',
  'image',
  'button',
  'divider',
  'columns',
  'attachment',
]);

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(
    @InjectRepository(EmailTemplateEntity)
    private readonly templates: Repository<EmailTemplateEntity>,
    @InjectRepository(EmailSegmentEntity)
    private readonly segments: Repository<EmailSegmentEntity>,
    @InjectRepository(EmailCampaignEntity)
    private readonly campaigns: Repository<EmailCampaignEntity>,
    @InjectRepository(EmailMessageEntity)
    private readonly messages: Repository<EmailMessageEntity>,
    @InjectRepository(EmailSuppressionEntity)
    private readonly suppressions: Repository<EmailSuppressionEntity>,
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    private readonly queue: EmailQueueService,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
    private readonly heartbeat: OpsHeartbeatService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {
    const apiKey = this.config.get('email.apiKey', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  onModuleInit() {
    this.queue.listen((job) => this.processJob(job));
  }

  async listTemplates() {
    const rows = await this.templates.find({ order: { updatedAt: 'DESC' } });
    return rows.map((row) => this.templateDto(row));
  }

  async createTemplate(
    input: { name: string; subject: string; kind: EmailKind; blocks: unknown },
    actorId?: string,
  ) {
    const row = await this.templates.save(
      this.templates.create({
        name: input.name.trim(),
        subject: input.subject.trim(),
        kind: input.kind,
        blocks: assertBlocks(input.blocks),
        createdBy: actorId ?? null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_TEMPLATE_CREATED',
      userId: actorId,
      resourceType: 'email_template',
      resourceId: row.id,
    });
    return this.templateDto(row);
  }

  async updateTemplate(
    id: string,
    input: Partial<{
      name: string;
      subject: string;
      kind: EmailKind;
      blocks: unknown;
    }>,
    actorId?: string,
  ) {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Template not found');
    if (input.name != null) row.name = input.name.trim();
    if (input.subject != null) row.subject = input.subject.trim();
    if (input.kind != null) row.kind = input.kind;
    if (input.blocks != null) row.blocks = assertBlocks(input.blocks);
    await this.templates.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_TEMPLATE_UPDATED',
      userId: actorId,
      resourceType: 'email_template',
      resourceId: row.id,
    });
    return this.templateDto(row);
  }

  async deleteTemplate(id: string, actorId?: string) {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Template not found');
    await this.templates.softRemove(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_TEMPLATE_DELETED',
      userId: actorId,
      resourceType: 'email_template',
      resourceId: row.id,
    });
    return { ok: true };
  }

  async listSegments() {
    const rows = await this.segments.find({ order: { name: 'ASC' } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      filters: row.filters,
      createdAt: row.createdAt,
    }));
  }

  async createSegment(
    input: { name: string; filters: Record<string, unknown> },
    actorId?: string,
  ) {
    const row = await this.segments.save(
      this.segments.create({
        name: input.name.trim(),
        filters: input.filters as AudienceFilter,
        createdBy: actorId ?? null,
      }),
    );
    return { id: row.id, name: row.name, filters: row.filters };
  }

  async updateSegment(
    id: string,
    input: { name?: string; filters?: Record<string, unknown> },
  ) {
    const row = await this.segments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Segment not found');
    if (input.name != null) row.name = input.name.trim();
    if (input.filters != null) row.filters = input.filters;
    await this.segments.save(row);
    return { id: row.id, name: row.name, filters: row.filters };
  }

  async deleteSegment(id: string) {
    const row = await this.segments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Segment not found');
    await this.segments.softRemove(row);
    return { ok: true };
  }

  async preview(audienceRaw: unknown, kind: EmailKind) {
    const audience = await this.resolveSpec(audienceRaw);
    const resolved = await this.collect(audience, kind === 'marketing');
    return {
      count: resolved.recipients.length,
      matched: resolved.matched,
      excludedSuppressed: resolved.excludedSuppressed,
      excludedOptOut: resolved.excludedOptOut,
    };
  }

  async sendSingle(
    input: { to: string; subject: string; blocks: unknown; kind: EmailKind },
    actorId?: string,
  ) {
    return this.createCampaign(
      {
        name: `Single to ${input.to}`,
        subject: input.subject,
        blocks: input.blocks,
        kind: input.kind,
        audience: { kind: 'explicit', emails: [input.to] },
      },
      actorId,
    );
  }

  async createCampaign(
    input: {
      name?: string;
      subject: string;
      blocks: unknown;
      kind: EmailKind;
      audience: unknown;
      scheduledAt?: string;
    },
    actorId?: string,
  ) {
    const blocks = assertBlocks(input.blocks);
    const audience = await this.resolveSpec(input.audience);
    const marketing = input.kind === 'marketing';
    const resolved = await this.collect(audience, marketing);
    if (!resolved.recipients.length) {
      throw new BadRequestException('No recipients after exclusions');
    }
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const delayed = scheduledAt != null && scheduledAt.getTime() > Date.now();
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        name: (input.name ?? input.subject).slice(0, 160),
        subject: input.subject,
        kind: input.kind,
        status: delayed ? 'scheduled' : 'queued',
        blocks,
        audience,
        scheduledAt,
        createdBy: actorId ?? null,
        stats: {
          matched: resolved.matched,
          recipients: resolved.recipients.length,
          excludedSuppressed: resolved.excludedSuppressed,
          excludedOptOut: resolved.excludedOptOut,
        },
      }),
    );
    const courseRows = await this.courses.find();
    const messages = resolved.recipients.map((recipient) => {
      const id = randomUUID();
      const rendered = renderEmail({
        blocks,
        subject: input.subject,
        vars: this.varsFor(recipient, courseRows),
        marketing,
        unsubscribeUrl: marketing
          ? this.unsubscribeUrl(recipient.email)
          : undefined,
      });
      return this.messages.create({
        id,
        campaignId: campaign.id,
        enrollmentId: recipient.id,
        toEmail: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        kind: input.kind,
        status: 'queued',
        attempts: 0,
        idempotencyKey: `msg_${id}`,
        attachments: rendered.attachments.map(toStoredAttachment),
      });
    });
    await this.messages.save(messages);
    const delay =
      delayed && scheduledAt ? scheduledAt.getTime() - Date.now() : 0;
    await this.queue.enqueue({ campaignId: campaign.id }, delay);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_CAMPAIGN_CREATED',
      userId: actorId,
      resourceType: 'email_campaign',
      resourceId: campaign.id,
      metadata: { recipients: messages.length, kind: input.kind },
    });
    return this.campaignDto(campaign);
  }

  async listCampaigns() {
    const rows = await this.campaigns.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.campaignDto(row));
  }

  async getCampaign(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    const messages = await this.messages.find({
      where: { campaignId: id },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return {
      ...this.campaignDto(row),
      messages: messages.map((message) => ({
        id: message.id,
        toEmail: message.toEmail,
        status: message.status,
        attempts: message.attempts,
        resendId: message.resendId ?? null,
        lastError: message.lastError ?? null,
      })),
    };
  }

  async setCampaignStatus(
    id: string,
    status: 'paused' | 'sending' | 'cancelled',
    actorId?: string,
  ) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    if (status === 'cancelled') {
      row.status = 'cancelled';
      await this.campaigns.save(row);
      await this.messages
        .createQueryBuilder()
        .update(EmailMessageEntity)
        .set({ status: 'cancelled', lastError: 'Campaign cancelled' })
        .where('campaign_id = :id AND status = :status', {
          id,
          status: 'queued',
        })
        .execute();
    } else if (status === 'paused') {
      row.status = 'paused';
      await this.campaigns.save(row);
    } else {
      row.status = 'sending';
      await this.campaigns.save(row);
      await this.queue.enqueue({ campaignId: id });
    }
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: `EMAIL_CAMPAIGN_${status.toUpperCase()}`,
      userId: actorId,
      resourceType: 'email_campaign',
      resourceId: id,
    });
    return this.campaignDto(row);
  }

  async retryFailed(id: string, actorId?: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    await this.messages
      .createQueryBuilder()
      .update(EmailMessageEntity)
      .set({ status: 'queued', attempts: 0, lastError: null })
      .where('campaign_id = :id AND status = :status', { id, status: 'failed' })
      .execute();
    row.status = 'sending';
    await this.campaigns.save(row);
    await this.queue.enqueue({ campaignId: id });
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_CAMPAIGN_RETRY',
      userId: actorId,
      resourceType: 'email_campaign',
      resourceId: id,
    });
    return this.campaignDto(row);
  }

  async testSend(
    input: { to: string; subject: string; blocks: unknown },
    actorId?: string,
  ) {
    const blocks = assertBlocks(input.blocks);
    const id = randomUUID();
    const rendered = renderEmail({
      blocks,
      subject: `[TEST] ${input.subject}`,
      vars: {
        firstName: 'Test',
        track: 'Sample track',
        amount: 'NGN 0',
        reference: 'TEST',
        cutoffDate: '',
        payLink: this.config.get('website.url', { infer: true }),
      },
      marketing: false,
    });
    const message = await this.messages.save(
      this.messages.create({
        id,
        toEmail: input.to.trim().toLowerCase(),
        subject: rendered.subject,
        html: rendered.html,
        textBody: rendered.text,
        kind: 'transactional',
        status: 'queued',
        attempts: 0,
        idempotencyKey: `msg_${id}`,
        attachments: rendered.attachments.map(toStoredAttachment),
      }),
    );
    await this.queue.enqueue({ messageId: message.id });
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'EMAIL_TEST_SENT',
      userId: actorId,
      resourceType: 'email_message',
      resourceId: message.id,
    });
    return { id: message.id, status: message.status };
  }

  async uploadImage(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    assertImageFile(file);
    const processed = await compressImage(file.buffer, file.mimetype);
    const stored = await this.storage.uploadFile(
      {
        buffer: processed.buffer,
        originalname: file.originalname.replace(/\.\w+$/, '.jpg'),
        mimetype: processed.mimetype,
        size: processed.buffer.length,
      },
      'email-images',
    );
    return stored;
  }

  async handleResendWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ) {
    const secret = this.config.get('email.webhookSecret', { infer: true });
    const ok = verifyResendSignature({
      rawBody,
      secret,
      svixId: headers['svix-id'],
      svixTimestamp: headers['svix-timestamp'],
      svixSignature: headers['svix-signature'],
    });
    if (!ok) throw new BadRequestException('Invalid Resend signature');
    this.heartbeat.beat('resend_webhook');
    const body = JSON.parse(rawBody.toString('utf8')) as {
      type?: string;
      data?: {
        email_id?: string;
        to?: string[];
        bounce?: { type?: string };
      };
    };
    const resendId = body.data?.email_id;
    if (!resendId) return { ok: true };
    const message = await this.messages.findOne({ where: { resendId } });
    if (!message) return { ok: true };
    const type = body.type ?? '';
    if (type === 'email.delivered') message.status = 'delivered';
    else if (type === 'email.opened') message.status = 'opened';
    else if (type === 'email.bounced') {
      message.status = 'bounced';
      const bounceType = body.data?.bounce?.type?.toLowerCase() ?? '';
      if (bounceType !== 'temporary' && bounceType !== 'transient') {
        await this.suppress(message.toEmail, 'bounce');
      }
    } else if (type === 'email.complained') {
      message.status = 'complained';
      await this.suppress(message.toEmail, 'complaint');
    } else if (type.endsWith('.failed') || type === 'email.failed') {
      message.status = 'failed';
    }
    await this.messages.save(message);
    return { ok: true };
  }

  async unsubscribe(token: string) {
    const secret = this.config.get('auth.jwtSecret', { infer: true });
    const email = verifyUnsubscribe(token, secret);
    if (!email) throw new BadRequestException('Invalid unsubscribe token');
    await this.enrollments
      .createQueryBuilder()
      .update(EnterFirstEnrollmentEntity)
      .set({ marketingOptIn: false })
      .where('lower(email) = :email', { email })
      .execute();
    await this.suppress(email, 'unsubscribe');
    return { ok: true, email };
  }

  async processJob(job: EmailJob) {
    if (job.messageId) {
      const message = await this.messages.findOne({
        where: { id: job.messageId },
      });
      if (!message || message.status !== 'queued') return;
      await this.dispatch([message]);
      return;
    }
    if (!job.campaignId) return;
    const campaign = await this.campaigns.findOne({
      where: { id: job.campaignId },
    });
    if (!campaign) return;
    if (campaign.status === 'paused' || campaign.status === 'cancelled') return;
    if (
      campaign.status === 'scheduled' &&
      campaign.scheduledAt &&
      campaign.scheduledAt.getTime() > Date.now()
    ) {
      return;
    }
    if (campaign.status === 'scheduled' || campaign.status === 'queued') {
      campaign.status = 'sending';
      await this.campaigns.save(campaign);
    }
    const batch = await this.messages.find({
      where: { campaignId: campaign.id, status: 'queued' },
      take: EMAIL_BATCH_SIZE,
      order: { createdAt: 'ASC' },
    });
    if (!batch.length) {
      const queued = await this.messages.count({
        where: { campaignId: campaign.id, status: 'queued' },
      });
      if (queued === 0 && campaign.status === 'sending') {
        campaign.status = 'completed';
        await this.campaigns.save(campaign);
      }
      return;
    }
    await this.dispatch(batch);
    const remaining = await this.messages.count({
      where: { campaignId: campaign.id, status: 'queued' },
    });
    if (remaining > 0) await this.queue.enqueue({ campaignId: campaign.id });
    else if (campaign.status === 'sending') {
      campaign.status = 'completed';
      await this.campaigns.save(campaign);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async promoteScheduled() {
    const due = await this.campaigns
      .createQueryBuilder('c')
      .where('c.status = :status', { status: 'scheduled' })
      .andWhere('c.scheduledAt IS NOT NULL')
      .andWhere('c.scheduledAt <= :now', { now: new Date() })
      .getMany();
    for (const campaign of due) {
      campaign.status = 'queued';
      await this.campaigns.save(campaign);
      await this.queue.enqueue({ campaignId: campaign.id });
    }
  }

  private async dispatch(batch: EmailMessageEntity[]) {
    for (const message of batch) {
      message.status = 'sending';
      message.attempts += 1;
    }
    await this.messages.save(batch);
    const rich = batch.filter((message) =>
      (message.attachments ?? []).some(
        (item) => item.content || (item.path && item.path !== '#'),
      ),
    );
    const plain = batch.filter((message) => !rich.includes(message));
    try {
      if (plain.length) await this.sendBatch(plain);
      for (const message of rich) await this.sendOne(message);
      await this.messages.save([...plain, ...rich]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const retry: EmailMessageEntity[] = [];
      for (const message of batch) {
        if (message.resendId) continue;
        message.lastError = reason.slice(0, 500);
        if (message.attempts >= EMAIL_MAX_ATTEMPTS) message.status = 'failed';
        else {
          message.status = 'queued';
          retry.push(message);
        }
      }
      await this.messages.save(batch);
      if (retry.length) {
        const delay = backoffMs(retry[0].attempts);
        const campaignId = retry[0].campaignId;
        if (campaignId && retry.length === batch.length) {
          await this.queue.enqueue({ campaignId }, delay);
        } else {
          for (const message of retry) {
            await this.queue.enqueue({ messageId: message.id }, delay);
          }
        }
      }
    }
  }

  private async sendBatch(messages: EmailMessageEntity[]) {
    const from = this.fromAddress();
    const payload = messages.map((message) => ({
      from,
      to: [message.toEmail],
      subject: message.subject,
      html: message.html,
      text: message.textBody,
      headers: { 'X-Entity-Ref-ID': message.idempotencyKey },
    }));
    const idempotencyKey = batchIdempotencyKey(
      messages.map((message) => message.idempotencyKey),
    );
    if (!this.resend) {
      this.assertMockMail();
      messages.forEach((message, index) => {
        message.resendId = `mock_${message.id}_${index}`;
        message.status = 'delivered';
      });
      return;
    }
    const result = await this.resend.batch.send(payload, { idempotencyKey });
    if (result.error) throw new Error(result.error.message);
    const ids = result.data?.data ?? [];
    messages.forEach((message, index) => {
      message.resendId = ids[index]?.id ?? null;
      message.status = 'sending';
    });
  }

  private async sendOne(message: EmailMessageEntity) {
    const from = this.fromAddress();
    const attachments = (message.attachments ?? [])
      .filter((item) => item.content || (item.path && item.path !== '#'))
      .map((item) => ({
        filename: item.filename,
        content: item.content,
        path: item.path && item.path !== '#' ? item.path : undefined,
      }));
    if (!this.resend) {
      this.assertMockMail();
      message.resendId = `mock_${message.id}`;
      message.status = 'delivered';
      return;
    }
    const result = await this.resend.emails.send(
      {
        from,
        to: [message.toEmail],
        subject: message.subject,
        html: message.html,
        text: message.textBody,
        headers: { 'X-Entity-Ref-ID': message.idempotencyKey },
        attachments,
      },
      { idempotencyKey: message.idempotencyKey },
    );
    if (result.error) throw new Error(result.error.message);
    message.resendId = result.data?.id ?? null;
    message.status = 'sending';
  }

  private async collect(audience: AudienceSpec, marketing: boolean) {
    const rows = await this.enrollments.find({
      order: { createdAt: 'DESC' },
      take: 5000,
    });
    const suppressedRows = await this.suppressions.find();
    const suppressed = new Set(
      suppressedRows.map((row) => row.email.toLowerCase()),
    );
    const mapped: AudienceEnrollment[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      tracks: row.tracks ?? [],
      cohorts: row.cohorts ?? [],
      paymentStatus: row.paymentStatus,
      marketingOptIn: !!row.marketingOptIn,
      createdAt: row.createdAt,
      paystackReference: row.paystackReference,
      firstName: row.firstName,
      amount: row.amount,
      currency: row.currency,
      authorizationUrl: row.authorizationUrl,
    }));
    return resolveAudience({
      rows: mapped,
      audience,
      suppressed,
      marketing,
    });
  }

  private async resolveSpec(raw: unknown): Promise<AudienceSpec> {
    let audience: AudienceSpec;
    try {
      audience = parseAudience(raw);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid audience',
      );
    }
    if (audience.kind !== 'segment') return audience;
    const segment = await this.segments.findOne({
      where: { id: audience.segmentId },
    });
    if (!segment) throw new NotFoundException('Segment not found');
    return { kind: 'filter', filter: segment.filters ?? {} };
  }

  private varsFor(row: AudienceEnrollment, courses: CourseEntity[]) {
    const selected = courses.filter((course) =>
      row.tracks.includes(course.slug),
    );
    const cutoff = selected
      .map((course) => course.enrollmentCutoff)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const enrollment = row;
    const identity = enrollmentVarsPatch({
      firstName: row.firstName,
      amount: row.amount,
      currency: row.currency,
    });
    return {
      firstName: identity.firstName,
      track:
        selected.map((course) => course.name).join(', ') ||
        row.tracks.join(', '),
      amount: identity.amount,
      reference: enrollment.paystackReference ?? enrollment.id,
      cutoffDate: cutoff ? cutoff.toISOString().slice(0, 10) : '',
      payLink:
        row.authorizationUrl ||
        (enrollment.paystackReference
          ? `${this.config.get('website.url', { infer: true })}/core-3/enroll?pay=${encodeURIComponent(enrollment.paystackReference)}`
          : this.config.get('website.url', { infer: true })),
    };
  }

  private unsubscribeUrl(email: string) {
    const secret = this.config.get('auth.jwtSecret', { infer: true });
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180;
    const token = signUnsubscribe(email, secret, exp);
    const base = this.config.get('api.publicUrl', { infer: true });
    return `${base}/api/v1/enter-first/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private fromAddress() {
    const name = this.config.get('email.fromName', { infer: true });
    const email = this.config.get('email.fromEmail', { infer: true });
    return `${name} <${email}>`;
  }

  private assertMockMail() {
    if (this.config.get('nodeEnv', { infer: true }) === 'production') {
      throw new Error('RESEND_API_KEY must be set in production');
    }
    this.logger.warn(
      'RESEND_API_KEY missing; email marked delivered in mock mode',
    );
  }

  private async suppress(
    email: string,
    reason: 'bounce' | 'complaint' | 'unsubscribe',
  ) {
    const existing = await this.suppressions.findOne({
      where: { email: email.toLowerCase() },
    });
    if (existing) return;
    await this.suppressions.save(
      this.suppressions.create({ email: email.toLowerCase(), reason }),
    );
  }

  private templateDto(row: EmailTemplateEntity) {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      kind: row.kind,
      blocks: row.blocks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private campaignDto(row: EmailCampaignEntity) {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      kind: row.kind,
      status: row.status,
      audience: row.audience,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      stats: row.stats,
      createdAt: row.createdAt,
    };
  }
}

function assertBlocks(value: unknown): EmailBlock[] {
  if (!Array.isArray(value) || !value.length) {
    throw new BadRequestException('blocks must be a non-empty array');
  }
  for (const block of value) {
    if (!block || typeof block !== 'object' || !('type' in block)) {
      throw new BadRequestException('Invalid block');
    }
    if (!BLOCK_TYPES.has(String((block as { type: string }).type))) {
      throw new BadRequestException('Unsupported block type');
    }
  }
  return value as EmailBlock[];
}

function toStoredAttachment(item: {
  filename: string;
  content?: string;
  path?: string;
}): StoredAttachment {
  return {
    filename: item.filename,
    content: item.content,
    path: item.path,
  };
}

/** Fills first name and amount when the enrollment row is loaded with form fields. */
export function enrollmentVarsPatch(input: {
  firstName?: string;
  amount?: number;
  currency?: string;
}): { firstName: string; amount: string } {
  return {
    firstName: input.firstName ?? '',
    amount:
      input.amount != null
        ? `${input.currency ?? 'NGN'} ${input.amount.toLocaleString('en-NG')}`
        : '',
  };
}
