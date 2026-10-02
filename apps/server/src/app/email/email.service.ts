import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { EnvTypes } from '@app/shared';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import { Brackets, In, LessThanOrEqual, Repository } from 'typeorm';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { CourseEntity } from '../course/entities/course.entity';
import { renderEmail } from './email-render';
import {
  batchIdempotencyKey,
  chunkIds,
  idempotencyKeyForMessage,
  includeRecipient,
  retryDelayMs,
  type EmailKind,
} from './email-queue.policy';
import { mapResendEvent } from './resend-webhook';
import {
  readUnsubscribeToken,
  signUnsubscribeToken,
} from './unsubscribe-token';
import type {
  CreateCampaignDto,
  PreviewAudienceDto,
  SendEmailDto,
  TestSendDto,
  UpsertTemplateDto,
} from './dto/email.dto';
import {
  EmailCampaignEntity,
  EmailMessageEntity,
  EmailSuppressionEntity,
  EmailTemplateEntity,
  type EmailAttachment,
  type EmailAudience,
} from './entities/email.entities';

type Recipient = {
  enrollment?: EnterFirstEnrollmentEntity;
  email: string;
  name: string;
  marketingOptIn: boolean;
};

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @InjectRepository(EmailTemplateEntity)
    private readonly templates: Repository<EmailTemplateEntity>,
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
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  onModuleInit() {
    if (this.config.get('nodeEnv', { infer: true }) === 'test') return;
    try {
      const connection = redisConnection(
        this.config.get('redis.url', { infer: true }),
      );
      this.queue = new Queue('core30-email', { connection });
      this.worker = new Worker(
        'core30-email',
        async (job) => {
          const ids = (job.data as { messageIds?: string[] }).messageIds ?? [];
          await this.processIds(ids);
        },
        { connection, concurrency: 1 },
      );
      this.worker.on('error', (error) => {
        this.logger.error(`Email worker error: ${error.message}`);
      });
    } catch (error) {
      this.logger.error(
        `Email queue did not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async listTemplates() {
    const rows = await this.templates.find({ order: { name: 'ASC' } });
    return rows.map(toTemplate);
  }

  async createTemplate(dto: UpsertTemplateDto, userId?: string) {
    const row = await this.templates.save(
      this.templates.create({
        slug: dto.slug.trim().toLowerCase(),
        name: dto.name.trim(),
        subject: dto.subject,
        html: dto.html,
        text: dto.text ?? '',
        kind: dto.kind,
        createdBy: userId ?? null,
      }),
    );
    return toTemplate(row);
  }

  async updateTemplate(id: string, dto: Partial<UpsertTemplateDto>) {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Template not found');
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.subject !== undefined) row.subject = dto.subject;
    if (dto.html !== undefined) row.html = dto.html;
    if (dto.text !== undefined) row.text = dto.text;
    if (dto.kind !== undefined) row.kind = dto.kind;
    await this.templates.save(row);
    return toTemplate(row);
  }

  async removeTemplate(id: string) {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Template not found');
    await this.templates.softRemove(row);
    return { ok: true };
  }

  async preview(dto: PreviewAudienceDto) {
    const resolved = await this.resolveAudience(dto.audience, dto.kind);
    return {
      matched: resolved.matched,
      count: resolved.recipients.length,
      excluded: resolved.excluded,
    };
  }

  async sendSingle(dto: SendEmailDto, userId?: string) {
    if (dto.campaignName) {
      return this.createCampaign({ ...dto, name: dto.campaignName }, userId);
    }
    const resolved = await this.resolveAudience(dto.audience, dto.kind);
    if (!resolved.recipients.length) {
      throw new BadRequestException('No recipients after exclusions');
    }
    if (resolved.recipients.length > 1) {
      throw new BadRequestException(
        'Single send accepts one recipient. Use a campaign for bulk.',
      );
    }
    const content = await this.contentFrom(dto);
    const created = await this.createMessages({
      recipients: resolved.recipients,
      ...content,
      kind: dto.kind,
      attachments: [],
    });
    await this.enqueue(created.map((row) => row.id));
    return { messages: created.map(toMessage), excluded: resolved.excluded };
  }

  async testSend(dto: TestSendDto) {
    const enrollment = dto.enrollmentId
      ? await this.enrollments.findOne({ where: { id: dto.enrollmentId } })
      : null;
    const [message] = await this.createMessages({
      recipients: [
        {
          enrollment: enrollment ?? undefined,
          email: dto.to.trim().toLowerCase(),
          name: enrollment?.firstName ?? 'there',
          marketingOptIn: true,
        },
      ],
      subject: dto.subject,
      html: dto.html,
      text: dto.text ?? '',
      kind: 'transactional',
      attachments: [],
    });
    await this.processIds([message.id]);
    const fresh = await this.messages.findOne({ where: { id: message.id } });
    return toMessage(fresh ?? message);
  }

  async createCampaign(dto: CreateCampaignDto, userId?: string) {
    const resolved = await this.resolveAudience(dto.audience, dto.kind);
    if (!resolved.recipients.length) {
      throw new BadRequestException('No recipients after exclusions');
    }
    const content = await this.contentFrom(dto);
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        name: dto.name.trim(),
        templateId: dto.templateId ?? null,
        subject: content.subject,
        html: content.html,
        text: content.text,
        kind: dto.kind,
        audience: dto.audience,
        status: 'sending',
        totalRecipients: resolved.recipients.length,
        sentCount: 0,
        failedCount: 0,
        createdBy: userId ?? null,
        attachments: [],
      }),
    );
    const created = await this.createMessages({
      campaignId: campaign.id,
      recipients: resolved.recipients,
      ...content,
      kind: dto.kind,
      attachments: [],
    });
    await this.enqueue(created.map((row) => row.id));
    return {
      ...toCampaign(campaign),
      excluded: resolved.excluded,
      queued: created.length,
    };
  }

  async listCampaigns() {
    const rows = await this.campaigns.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map(toCampaign);
  }

  async getCampaign(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    const messages = await this.messages.find({
      where: { campaignId: id },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return { ...toCampaign(row), messages: messages.map(toMessage) };
  }

  async pause(id: string) {
    return this.setCampaignStatus(id, 'paused');
  }

  async resume(id: string) {
    const row = await this.setCampaignStatus(id, 'sending');
    const queued = await this.messages.find({
      where: { campaignId: id, status: 'queued' },
    });
    await this.enqueue(queued.map((message) => message.id));
    return row;
  }

  async cancel(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    row.status = 'cancelled';
    await this.campaigns.save(row);
    await this.messages.update(
      { campaignId: id, status: 'queued' },
      { status: 'failed', lastError: 'campaign_cancelled' },
    );
    return toCampaign(row);
  }

  async retryFailed(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    if (row.status === 'cancelled') {
      throw new BadRequestException('Cancelled campaigns cannot be retried');
    }
    const failed = await this.messages.find({
      where: { campaignId: id, status: 'failed' },
    });
    const retryable = failed.filter(
      (message) => message.lastError !== 'campaign_cancelled',
    );
    for (const message of retryable) {
      message.status = 'queued';
      message.attempts = 0;
      message.lastError = null;
      message.nextAttemptAt = new Date();
      message.claimToken = null;
    }
    if (retryable.length) await this.messages.save(retryable);
    row.status = 'sending';
    await this.campaigns.save(row);
    await this.enqueue(retryable.map((message) => message.id));
    return { retried: retryable.length };
  }

  async listMessages(campaignId?: string) {
    const rows = await this.messages.find({
      where: campaignId ? { campaignId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map(toMessage);
  }

  async listSuppressions() {
    const rows = await this.suppressions.find({
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      reason: row.reason,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    }));
  }

  async unsubscribe(token: string) {
    const secret = this.config.get('unsubscribe.secret', { infer: true });
    const email = readUnsubscribeToken(token, secret);
    if (!email) throw new BadRequestException('Invalid unsubscribe token');
    await this.suppress(email, 'unsubscribe');
    await this.enrollments.update({ email }, { marketingOptIn: false });
    return { ok: true, email };
  }

  async handleResendEvent(input: {
    event: string;
    emailId?: string;
    email?: string;
    bounceType?: string;
  }) {
    const mapped = mapResendEvent(input.event, input.bounceType);
    if (!mapped) return { ok: true, ignored: true };
    const message = input.emailId
      ? await this.messages.findOne({ where: { resendId: input.emailId } })
      : null;
    if (message) {
      message.status = mapped.status;
      await this.messages.save(message);
    }
    const address = (message?.toEmail ?? input.email)?.toLowerCase();
    if (address && mapped.suppress)
      await this.suppress(address, mapped.suppress);
    return { ok: true };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async pumpQueue() {
    if (this.config.get('nodeEnv', { infer: true }) === 'test') return;
    const due = await this.messages.find({
      where: { status: 'queued', nextAttemptAt: LessThanOrEqual(new Date()) },
      take: this.batchSize(),
      order: { nextAttemptAt: 'ASC' },
    });
    if (!due.length) return;
    await this.enqueue(due.map((row) => row.id));
    await this.completeCampaigns();
  }

  async processIds(ids: string[]) {
    if (!ids.length) return;
    const claim = randomUUID();
    await this.messages
      .createQueryBuilder()
      .update()
      .set({
        status: 'sending',
        claimToken: claim,
        attempts: () => '"attempts" + 1',
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('status = :status', { status: 'queued' })
      .execute();
    const claimed = await this.messages.find({ where: { claimToken: claim } });
    const ready: EmailMessageEntity[] = [];
    for (const message of claimed) {
      if (message.campaignId) {
        const campaign = await this.campaigns.findOne({
          where: { id: message.campaignId },
        });
        if (!campaign || campaign.status === 'paused') {
          message.status = 'queued';
          message.attempts = Math.max(0, message.attempts - 1);
          message.claimToken = null;
          await this.messages.save(message);
          continue;
        }
        if (campaign.status === 'cancelled') {
          message.status = 'failed';
          message.lastError = 'campaign_cancelled';
          message.claimToken = null;
          await this.messages.save(message);
          continue;
        }
      }
      if (message.resendId) {
        message.status = 'delivered';
        message.claimToken = null;
        await this.messages.save(message);
        continue;
      }
      ready.push(message);
    }
    for (const batch of chunkIds(ready, this.batchSize())) {
      await this.sendBatch(batch);
    }
    await this.completeCampaigns();
  }

  private async sendBatch(batch: EmailMessageEntity[]) {
    if (!batch.length) return;
    const from = this.fromAddress();
    const keys = batch.map((message) => message.idempotencyKey);
    try {
      const ids = await this.postResendBatch(
        batch.map((message) => ({
          from,
          to: [message.toEmail],
          subject: message.subject,
          html: message.html,
          text: message.text,
          attachments: (message.attachments ?? []).map((file) => ({
            filename: file.filename,
            path: file.url,
          })),
        })),
        batchIdempotencyKey(keys),
      );
      batch.forEach((message, index) => {
        message.resendId = ids[index] ?? null;
        message.status = 'sending';
        message.lastError = null;
        message.claimToken = null;
        message.nextAttemptAt = null;
      });
      await this.messages.save(batch);
      await this.bumpCampaignCounts(batch, 'sent');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const max = this.config.get('email.maxAttempts', { infer: true });
      for (const message of batch) {
        const delay = retryDelayMs(message.attempts, max);
        message.claimToken = null;
        message.lastError = reason.slice(0, 2000);
        if (delay == null) {
          message.status = 'failed';
          message.nextAttemptAt = null;
        } else {
          message.status = 'queued';
          message.nextAttemptAt = new Date(Date.now() + delay);
        }
      }
      await this.messages.save(batch);
      await this.bumpCampaignCounts(
        batch.filter((message) => message.status === 'failed'),
        'failed',
      );
    }
  }

  private async postResendBatch(
    payload: unknown[],
    idempotencyKey: string,
  ): Promise<Array<string | null>> {
    const apiKey = this.config.get('email.apiKey', { infer: true });
    if (!apiKey) {
      if (this.config.get('nodeEnv', { infer: true }) === 'production') {
        throw new Error('RESEND_API_KEY is not configured');
      }
      return payload.map(
        (_, index) => `mock-${idempotencyKey.slice(0, 12)}-${index}`,
      );
    }
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as {
      data?: Array<{ id?: string }>;
      message?: string;
      name?: string;
    };
    if (!res.ok || !body.data) {
      throw new Error(
        body.message || body.name || `Resend batch failed (${res.status})`,
      );
    }
    return body.data.map((item) => item.id ?? null);
  }

  private async resolveAudience(audience: EmailAudience, kind: EmailKind) {
    const qb = this.enrollments
      .createQueryBuilder('e')
      .where('e.anonymised_at IS NULL');
    if (audience.kind === 'filter') {
      if (audience.paymentStatuses?.length) {
        qb.andWhere('e.payment_status IN (:...paymentStatuses)', {
          paymentStatuses: audience.paymentStatuses,
        });
      }
      if (audience.pendingHours) {
        qb.andWhere('e.payment_status = :pending', { pending: 'pending' });
        qb.andWhere('e.created_at <= :pendingSince', {
          pendingSince: new Date(
            Date.now() - audience.pendingHours * 3_600_000,
          ),
        });
      }
      if (audience.createdFrom) {
        qb.andWhere('e.created_at >= :createdFrom', {
          createdFrom: new Date(audience.createdFrom),
        });
      }
      if (audience.createdTo) {
        qb.andWhere('e.created_at <= :createdTo', {
          createdTo: new Date(audience.createdTo),
        });
      }
      if (audience.marketingOptIn === true) {
        qb.andWhere('e.marketing_opt_in = true');
      }
      const slugs = [...(audience.tracks ?? [])];
      if (audience.cohort) {
        const matched = await this.courses.find({
          where: [{ cohort: audience.cohort }, { slug: audience.cohort }],
        });
        slugs.push(...matched.map((course) => course.slug));
        if (!matched.length) {
          return {
            matched: 0,
            recipients: [] as Recipient[],
            excluded: { suppressed: 0, marketingOptOut: 0, duplicate: 0 },
          };
        }
      }
      if (slugs.length) {
        qb.andWhere(
          new Brackets((sub) => {
            slugs.forEach((slug, index) => {
              const clause = `e.tracks @> CAST(:track${index} AS jsonb)`;
              if (index === 0)
                sub.where(clause, {
                  [`track${index}`]: JSON.stringify([slug]),
                });
              else
                sub.orWhere(clause, {
                  [`track${index}`]: JSON.stringify([slug]),
                });
            });
          }),
        );
      }
    } else if (audience.kind === 'explicit') {
      const ids = audience.enrollmentIds ?? [];
      const emails = (audience.emails ?? []).map((email) =>
        email.toLowerCase(),
      );
      const references = audience.references ?? [];
      if (!ids.length && !emails.length && !references.length) {
        throw new BadRequestException('Explicit audience is empty');
      }
      qb.andWhere(
        new Brackets((sub) => {
          let started = false;
          if (ids.length) {
            sub.where('e.id IN (:...ids)', { ids });
            started = true;
          }
          if (emails.length) {
            if (started) sub.orWhere('e.email IN (:...emails)', { emails });
            else sub.where('e.email IN (:...emails)', { emails });
            started = true;
          }
          if (references.length) {
            if (started) {
              sub.orWhere('e.paystack_reference IN (:...references)', {
                references,
              });
            } else {
              sub.where('e.paystack_reference IN (:...references)', {
                references,
              });
            }
          }
        }),
      );
    }

    const rows =
      audience.kind === 'explicit' &&
      !(
        audience.enrollmentIds?.length ||
        audience.emails?.length ||
        audience.references?.length
      )
        ? []
        : await qb.getMany();
    const suppressionRows = await this.suppressions.find();
    const suppressed = new Map(
      suppressionRows.map((row) => [row.email, row.reason]),
    );
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    const excluded = { suppressed: 0, marketingOptOut: 0, duplicate: 0 };
    for (const row of rows) {
      const decision = includeRecipient({
        kind,
        marketingOptIn: row.marketingOptIn,
        suppression: suppressed.get(row.email),
      });
      if (!decision.include) {
        if (decision.reason === 'marketing_opt_out')
          excluded.marketingOptOut += 1;
        else excluded.suppressed += 1;
        continue;
      }
      if (seen.has(row.email)) {
        excluded.duplicate += 1;
        continue;
      }
      seen.add(row.email);
      recipients.push({
        enrollment: row,
        email: row.email,
        name: row.firstName,
        marketingOptIn: row.marketingOptIn,
      });
    }

    if (audience.kind === 'explicit') {
      for (const email of audience.emails ?? []) {
        const normalised = email.trim().toLowerCase();
        if (seen.has(normalised)) continue;
        const decision = includeRecipient({
          kind,
          marketingOptIn: false,
          suppression: suppressed.get(normalised),
        });
        if (!decision.include) {
          if (decision.reason === 'marketing_opt_out')
            excluded.marketingOptOut += 1;
          else excluded.suppressed += 1;
          continue;
        }
        seen.add(normalised);
        recipients.push({
          email: normalised,
          name: 'there',
          marketingOptIn: false,
        });
      }
    }

    return { matched: rows.length, recipients, excluded };
  }

  private async createMessages(input: {
    campaignId?: string;
    recipients: Recipient[];
    subject: string;
    html: string;
    text: string;
    kind: EmailKind;
    attachments: EmailAttachment[];
  }) {
    const secret = this.config.get('unsubscribe.secret', { infer: true });
    const rows = input.recipients.map((recipient) => {
      const unsubscribeUrl = `${this.apiBase()}/api/v1/enter-first/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(recipient.email, secret))}`;
      const enrollment = recipient.enrollment;
      const rendered = renderEmail({
        subject: input.subject,
        html: input.html,
        text: input.text,
        kind: input.kind,
        vars: {
          firstName: enrollment?.firstName ?? recipient.name,
          lastName: enrollment?.lastName ?? '',
          track: enrollment?.tracks?.join(', ') ?? '',
          amount: enrollment
            ? `${enrollment.currency} ${enrollment.amount}`
            : '',
          reference: enrollment?.paystackReference ?? '',
          cutoffDate: enrollment?.priceSnapshot?.[0]?.enrollmentCutoff
            ? String(enrollment.priceSnapshot[0].enrollmentCutoff).slice(0, 10)
            : '',
          payLink: enrollment?.authorizationUrl ?? '',
          unsubscribeUrl,
        },
      });
      return this.messages.create({
        campaignId: input.campaignId ?? null,
        enrollmentId: enrollment?.id ?? null,
        toEmail: recipient.email,
        toName: recipient.name,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        kind: input.kind,
        status: 'queued',
        attempts: 0,
        idempotencyKey: `pending-${randomUUID()}`,
        nextAttemptAt: new Date(),
        attachments: input.attachments,
      });
    });
    const saved = await this.messages.save(rows);
    for (const row of saved) {
      row.idempotencyKey = idempotencyKeyForMessage(row.id);
    }
    return this.messages.save(saved);
  }

  private async contentFrom(dto: SendEmailDto) {
    if (!dto.templateId) {
      return { subject: dto.subject, html: dto.html, text: dto.text ?? '' };
    }
    const template = await this.templates.findOne({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('Template not found');
    return {
      subject: dto.subject || template.subject,
      html: dto.html || template.html,
      text: dto.text || template.text,
    };
  }

  private async enqueue(ids: string[]) {
    const batches = chunkIds(ids, this.batchSize());
    for (const batch of batches) {
      if (this.queue) {
        try {
          await this.queue.add(
            'send',
            { messageIds: batch },
            {
              attempts: this.config.get('email.maxAttempts', { infer: true }),
              backoff: { type: 'exponential', delay: 30_000 },
              removeOnComplete: 1000,
              removeOnFail: 1000,
            },
          );
          continue;
        } catch (error) {
          this.logger.warn(
            `Queue add failed, sending inline: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await this.processIds(batch);
    }
  }

  private async suppress(
    email: string,
    reason: 'hard_bounce' | 'complaint' | 'unsubscribe',
  ) {
    const existing = await this.suppressions.findOne({ where: { email } });
    if (existing) {
      if (existing.reason !== reason && reason !== 'unsubscribe') {
        existing.reason = reason;
        await this.suppressions.save(existing);
      }
      return;
    }
    await this.suppressions.save(this.suppressions.create({ email, reason }));
  }

  private async setCampaignStatus(
    id: string,
    status: EmailCampaignEntity['status'],
  ) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Campaign not found');
    row.status = status;
    await this.campaigns.save(row);
    return toCampaign(row);
  }

  private async bumpCampaignCounts(
    messages: EmailMessageEntity[],
    field: 'sent' | 'failed',
  ) {
    const ids = [
      ...new Set(messages.map((message) => message.campaignId).filter(Boolean)),
    ] as string[];
    if (!ids.length) return;
    const rows = await this.campaigns.find({ where: { id: In(ids) } });
    for (const row of rows) {
      const count = messages.filter(
        (message) => message.campaignId === row.id,
      ).length;
      if (field === 'sent') row.sentCount += count;
      else row.failedCount += count;
    }
    await this.campaigns.save(rows);
  }

  private async completeCampaigns() {
    const open = await this.campaigns.find({
      where: [{ status: 'sending' }, { status: 'queued' }],
    });
    for (const campaign of open) {
      const pending = await this.messages.count({
        where: [
          { campaignId: campaign.id, status: 'queued' },
          { campaignId: campaign.id, status: 'sending' },
        ],
      });
      if (pending === 0) {
        campaign.status =
          campaign.failedCount && !campaign.sentCount ? 'failed' : 'completed';
        await this.campaigns.save(campaign);
      }
    }
  }

  private batchSize() {
    return this.config.get('email.batchSize', { infer: true });
  }

  private fromAddress() {
    const name = this.config.get('email.fromName', { infer: true });
    const email = this.config.get('email.fromEmail', { infer: true });
    return `${name} <${email}>`;
  }

  private apiBase() {
    const configured = this.config.get('http.publicApiUrl', { infer: true });
    if (configured) return configured.replace(/\/$/, '');
    const port = this.config.get('port', { infer: true });
    return `http://localhost:${port}`;
  }
}

function toTemplate(row: EmailTemplateEntity) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subject: row.subject,
    html: row.html,
    text: row.text,
    kind: row.kind,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function toCampaign(row: EmailCampaignEntity) {
  return {
    id: row.id,
    name: row.name,
    templateId: row.templateId ?? null,
    subject: row.subject,
    kind: row.kind,
    status: row.status,
    audience: row.audience,
    totalRecipients: row.totalRecipients,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

function toMessage(row: EmailMessageEntity) {
  return {
    id: row.id,
    campaignId: row.campaignId ?? null,
    enrollmentId: row.enrollmentId ?? null,
    toEmail: row.toEmail,
    toName: row.toName,
    subject: row.subject,
    status: row.status,
    attempts: row.attempts,
    resendId: row.resendId ?? null,
    idempotencyKey: row.idempotencyKey,
    lastError: row.lastError ?? null,
    kind: row.kind,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  const db = Number((url.pathname || '/0').replace('/', '') || 0);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || '') || undefined,
    password: decodeURIComponent(url.password || '') || undefined,
    db: Number.isFinite(db) ? db : 0,
    maxRetriesPerRequest: null,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}
