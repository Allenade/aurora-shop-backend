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
import { Brackets, DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { CourseEntity } from '../course/entities/course.entity';
import { ADVISORY_LOCK, withAdvisoryLock } from '../../common/db/advisory-lock';
import { renderEmail } from './email-render';
import { deliverAddress, isDeliverableEmail } from './email-safety';
import {
  CONFIRMATION_CLAIM_WHERE,
  CONFIRMATION_EMAIL_ATTEMPTS,
  enrollmentConfirmationIdempotencyKey,
  readConfirmationJob,
  renderEnrollmentConfirmation,
  type ConfirmationJobData,
} from './enrollment-confirmation';
import {
  dedupeComposeRecipients,
  parseSelectors,
  type ComposeCandidate,
  type ParsedSelector,
} from './recipient-selectors';
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
  PreviewSelectorsDto,
  SaveDraftDto,
  ScheduleDraftDto,
  SendEmailDto,
  TestSendDto,
  TestToMeDto,
  UpdateDraftDto,
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
    private readonly dataSource: DataSource,
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
          if (job.name === 'enrollment-confirmation') {
            const data = readConfirmationJob(job.data);
            if (!data) return;
            await this.deliverEnrollmentConfirmation(data);
            return;
          }
          const payload = job.data as { messageIds?: string[] };
          const ids = payload.messageIds ?? [];
          await this.processIds(ids);
        },
        { connection, concurrency: 1 },
      );
      this.worker.on('failed', (job, error) => {
        if (!job || job.name !== 'enrollment-confirmation') return;
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < maxAttempts) return;
        const data = readConfirmationJob(job.data);
        if (!data) return;
        const reason = error instanceof Error ? error.message : String(error);
        void this.markConfirmationFailed(data.enrollmentIds, reason).catch(
          (err: unknown) => {
            this.logger.error(
              `Could not record confirmation failure: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          },
        );
      });
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
    await withAdvisoryLock(
      this.dataSource,
      ADVISORY_LOCK.emailPump,
      async () => {
        const due = await this.messages.find({
          where: {
            status: 'queued',
            nextAttemptAt: LessThanOrEqual(new Date()),
          },
          take: this.batchSize(),
          order: { nextAttemptAt: 'ASC' },
        });
        if (!due.length) return;
        await this.enqueue(due.map((row) => row.id));
        await this.completeCampaigns();
      },
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchScheduledCampaigns() {
    if (this.config.get('nodeEnv', { infer: true }) === 'test') return;
    await withAdvisoryLock(
      this.dataSource,
      ADVISORY_LOCK.emailSchedule,
      async () => {
        const due = await this.campaigns.find({
          where: {
            status: 'scheduled',
            scheduledAt: LessThanOrEqual(new Date()),
          },
          take: 20,
          order: { scheduledAt: 'ASC' },
        });
        for (const row of due) {
          try {
            await this.sendDraftNow(row.id, { quiet: true });
          } catch (error) {
            this.logger.warn(
              `Scheduled send failed for ${row.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      },
    );
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
    const outbound: Array<{ message: EmailMessageEntity; to: string }> = [];
    const skipped: EmailMessageEntity[] = [];
    for (const message of batch) {
      const decision = deliverAddress(message.toEmail, {
        allowlist: this.config.get('email.allowlist', { infer: true }),
        redirectTo: this.config.get('email.redirectTo', { infer: true }),
      });
      if (decision.action === 'skip') {
        message.status = 'failed';
        message.lastError = decision.reason.slice(0, 2000);
        message.claimToken = null;
        message.nextAttemptAt = null;
        skipped.push(message);
        continue;
      }
      if (decision.redirectedFrom) {
        this.logger.log(
          `[email-redirect] ${decision.redirectedFrom} → ${decision.to}`,
        );
      }
      outbound.push({ message, to: decision.to });
    }
    if (skipped.length) {
      await this.messages.save(skipped);
      await this.bumpCampaignCounts(skipped, 'failed');
    }
    if (!outbound.length) return;
    const keys = outbound.map((item) => item.message.idempotencyKey);
    if (!this.config.get('email.apiKey', { infer: true })) {
      this.logger.log(
        `[email-dry-run] RESEND_API_KEY missing; ${outbound.length} message(s) not sent`,
      );
      for (const item of outbound) {
        this.logger.log(
          `[email-dry-run] to=${item.to} subject=${item.message.subject}`,
        );
        item.message.status = 'delivered';
        item.message.resendId = null;
        item.message.lastError = null;
        item.message.claimToken = null;
        item.message.nextAttemptAt = null;
      }
      const dry = outbound.map((item) => item.message);
      await this.messages.save(dry);
      await this.bumpCampaignCounts(dry, 'sent');
      return;
    }
    try {
      const ids = await this.postResendBatch(
        outbound.map((item) => ({
          from,
          to: [item.to],
          subject: item.message.subject,
          html: item.message.html,
          text: item.message.text,
          attachments: (item.message.attachments ?? []).map((file) => ({
            filename: file.filename,
            path: file.url,
          })),
        })),
        batchIdempotencyKey(keys),
      );
      outbound.forEach((item, index) => {
        item.message.resendId = ids[index] ?? null;
        item.message.status = 'sending';
        item.message.lastError = null;
        item.message.claimToken = null;
        item.message.nextAttemptAt = null;
      });
      const sent = outbound.map((item) => item.message);
      await this.messages.save(sent);
      await this.bumpCampaignCounts(sent, 'sent');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const max = this.config.get('email.maxAttempts', { infer: true });
      const failedBatch = outbound.map((item) => item.message);
      for (const message of failedBatch) {
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
      await this.messages.save(failedBatch);
      await this.bumpCampaignCounts(
        failedBatch.filter((message) => message.status === 'failed'),
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
      this.logger.log(
        `[email-dry-run] Resend batch skipped (${payload.length}) key=${idempotencyKey}`,
      );
      return payload.map(() => null);
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
    const counts = new Map<string, number>();
    for (const message of messages) {
      if (!message.campaignId) continue;
      counts.set(message.campaignId, (counts.get(message.campaignId) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      const amount = Math.trunc(count);
      if (amount < 1) continue;
      const update = this.campaigns
        .createQueryBuilder()
        .update(EmailCampaignEntity)
        .where('id = :id', { id });
      if (field === 'sent') {
        await update
          .set({ sentCount: () => `"sent_count" + ${amount}` })
          .execute();
      } else {
        await update
          .set({ failedCount: () => `"failed_count" + ${amount}` })
          .execute();
      }
    }
  }

  async previewSelectors(dto: PreviewSelectorsDto) {
    const resolved = await this.resolveSelectors(
      dto.selectors ?? [],
      dto.kind ?? 'transactional',
    );
    return {
      count: resolved.recipients.length,
      sample: resolved.recipients.slice(0, 8).map((person) => ({
        email: person.email,
        name: person.name,
        enrollmentId: person.enrollmentId,
        courses: person.courses,
      })),
    };
  }

  async searchStudents(q: string, limitRaw?: string) {
    const term = q.trim();
    if (!term) return { items: [] as ComposeSample[] };
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 20));
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .where('e.anonymised_at IS NULL')
      .andWhere(
        `(e.email ILIKE :q OR e.first_name ILIKE :q OR e.last_name ILIKE :q OR (e.first_name || ' ' || e.last_name) ILIKE :q)`,
        { q: `%${term}%` },
      )
      .orderBy('e.createdAt', 'DESC')
      .take(limit)
      .getMany();
    const content = await this.courseContent(
      rows.flatMap((row) => row.tracks ?? []),
    );
    return {
      items: dedupeComposeRecipients(
        rows.map((row) => this.toCandidate(row, content.titles)),
      ).map(toComposeSample),
    };
  }

  async saveDraft(dto: SaveDraftDto, userId?: string) {
    this.assertSelectors(dto.selectors ?? []);
    const row = await this.campaigns.save(
      this.campaigns.create({
        name: (dto.name?.trim() || dto.subject.trim()).slice(0, 160),
        subject: dto.subject,
        html: dto.html,
        text: dto.text ?? '',
        kind: dto.kind ?? 'transactional',
        audience: { kind: 'explicit', emails: [] },
        selectors: dto.selectors ?? [],
        status: 'draft',
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
        createdBy: userId ?? null,
        attachments: [],
        scheduledAt: null,
      }),
    );
    return toDraft(row);
  }

  async updateDraft(id: string, dto: UpdateDraftDto) {
    const row = await this.requireEditableDraft(id);
    if (dto.selectors) this.assertSelectors(dto.selectors);
    if (dto.name !== undefined) row.name = dto.name.trim().slice(0, 160);
    if (dto.subject !== undefined) row.subject = dto.subject;
    if (dto.html !== undefined) row.html = dto.html;
    if (dto.text !== undefined) row.text = dto.text;
    if (dto.kind !== undefined) row.kind = dto.kind;
    if (dto.selectors !== undefined) row.selectors = dto.selectors;
    await this.campaigns.save(row);
    return toDraft(row);
  }

  async deleteDraft(id: string) {
    const row = await this.requireEditableDraft(id);
    await this.campaigns.softRemove(row);
    return { ok: true };
  }

  async listDrafts() {
    const rows = await this.campaigns.find({
      where: [{ status: 'draft' }, { status: 'scheduled' }],
      order: { updatedAt: 'DESC' },
      take: 100,
    });
    return rows.map(toDraft);
  }

  async getDraft(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row || (row.status !== 'draft' && row.status !== 'scheduled')) {
      throw new NotFoundException('Draft not found');
    }
    return toDraft(row);
  }

  async scheduleDraft(id: string, dto: ScheduleDraftDto) {
    const row = await this.requireEditableDraft(id);
    const sendAt = new Date(dto.sendAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
      throw new BadRequestException('sendAt must be a future datetime');
    }
    row.status = 'scheduled';
    row.scheduledAt = sendAt;
    await this.campaigns.save(row);
    return toDraft(row);
  }

  async sendDraftNow(id: string, opts?: { quiet?: boolean }) {
    const claimed = await this.campaigns
      .createQueryBuilder()
      .update(EmailCampaignEntity)
      .set({ status: 'sending' })
      .where('id = :id', { id })
      .andWhere("status IN ('draft', 'scheduled')")
      .andWhere('deleted_at IS NULL')
      .returning('*')
      .execute();
    if (!returnedIds(claimed.raw).length) {
      if (opts?.quiet) return null;
      const existing = await this.campaigns.findOne({ where: { id } });
      if (!existing) throw new NotFoundException('Draft not found');
      throw new BadRequestException('Draft is not waiting to send');
    }
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Draft not found');
    const resolved = await this.resolveSelectors(row.selectors ?? [], row.kind);
    if (!resolved.recipients.length) {
      row.status = 'failed';
      row.totalRecipients = 0;
      await this.campaigns.save(row);
      if (opts?.quiet) return null;
      throw new BadRequestException('No recipients after exclusions');
    }
    const enrollmentIds = resolved.recipients
      .map((person) => person.enrollmentId)
      .filter((value): value is string => Boolean(value));
    const enrolled = enrollmentIds.length
      ? await this.enrollments.find({ where: { id: In(enrollmentIds) } })
      : [];
    const byId = new Map(enrolled.map((item) => [item.id, item]));
    row.totalRecipients = resolved.recipients.length;
    row.audience = {
      kind: 'explicit',
      emails: resolved.recipients.map((person) => person.email),
    };
    await this.campaigns.save(row);
    const created = await this.createMessages({
      campaignId: row.id,
      recipients: resolved.recipients.map((person) => ({
        email: person.email,
        name: person.name || 'there',
        marketingOptIn: person.marketingOptIn,
        enrollment: person.enrollmentId
          ? byId.get(person.enrollmentId)
          : undefined,
      })),
      subject: row.subject,
      html: row.html,
      text: row.text,
      kind: row.kind,
      attachments: row.attachments ?? [],
    });
    await this.enqueue(created.map((message) => message.id));
    return { ...toCampaign(row), queued: created.length };
  }

  async sendDraftTest(id: string, adminEmail: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Draft not found');
    return this.sendTestToAdmin(adminEmail, {
      subject: row.subject,
      html: row.html,
      text: row.text,
    });
  }

  async sendTestToAdmin(adminEmail: string, dto: TestToMeDto) {
    const email = adminEmail.trim().toLowerCase();
    if (!email) throw new BadRequestException('Admin account has no email');
    const [message] = await this.createMessages({
      recipients: [{ email, name: 'there', marketingOptIn: true }],
      subject: dto.subject,
      html: dto.html,
      text: dto.text ?? '',
      kind: 'transactional',
      attachments: [],
    });
    await this.enqueue([message.id]);
    const fresh = await this.messages.findOne({ where: { id: message.id } });
    return toMessage(fresh ?? message);
  }

  async listSent() {
    const rows = await this.campaigns.find({
      where: [
        { status: 'queued' },
        { status: 'sending' },
        { status: 'paused' },
        { status: 'completed' },
        { status: 'cancelled' },
        { status: 'failed' },
      ],
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      subject: row.subject,
      status: row.status,
      totalRecipients: row.totalRecipients,
      sentCount: row.sentCount,
      failedCount: row.failedCount,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    }));
  }

  async getSent(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row || row.status === 'draft' || row.status === 'scheduled') {
      throw new NotFoundException('Sent email not found');
    }
    const messages = await this.messages.find({
      where: { campaignId: id },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    return {
      ...toCampaign(row),
      html: row.html,
      text: row.text,
      sentCount: row.sentCount,
      failedCount: row.failedCount,
      recipients: messages.map((message) => ({
        id: message.id,
        enrollmentId: message.enrollmentId ?? null,
        email: message.toEmail,
        name: message.toName,
        status: message.status,
        attempts: message.attempts,
        lastError: message.lastError ?? null,
        resendId: message.resendId ?? null,
      })),
    };
  }

  async resendFailed(id: string) {
    return this.retryFailed(id);
  }

  /** Claim unpaid confirmation rows for a Paystack reference, then queue one email. */
  async claimAndQueueConfirmation(paymentRef: string) {
    const ref = paymentRef.trim();
    if (!ref) return { claimed: 0 };
    const matches = await this.enrollments.find({
      where: { paystackReference: ref, paymentStatus: 'success' },
    });
    const claimed = await this.claimConfirmationIds(
      matches.map((row) => row.id),
    );
    if (!claimed.length) return { claimed: 0 };
    await this.enqueueConfirmation({
      paymentRef: ref,
      idempotencyKey: enrollmentConfirmationIdempotencyKey(ref),
      enrollmentIds: claimed,
    });
    return { claimed: claimed.length };
  }

  /** Admin resend. Skips the claim predicate and still uses the email queue. */
  async resendEnrollmentConfirmation(enrollmentId: string) {
    const row = await this.enrollments.findOne({ where: { id: enrollmentId } });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (row.paymentStatus !== 'success') {
      throw new BadRequestException('Enrollment is not paid');
    }
    await this.enrollments
      .createQueryBuilder()
      .update(EnterFirstEnrollmentEntity)
      .set({
        confirmationEmailStatus: 'sending',
        confirmationEmailClaimedAt: () => 'NOW()',
        confirmationEmailError: null,
      })
      .where('id = :id', { id: row.id })
      .andWhere("payment_status = 'success'")
      .andWhere('deleted_at IS NULL')
      .execute();
    const ref = row.paystackReference || row.id;
    await this.enqueueConfirmation({
      paymentRef: ref,
      idempotencyKey: enrollmentConfirmationIdempotencyKey(
        ref,
        `resend-${Date.now()}`,
      ),
      enrollmentIds: [row.id],
    });
    return { queued: true, id: row.id };
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

  private assertSelectors(selectors: string[]) {
    try {
      return parseSelectors(selectors);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid selector',
      );
    }
  }

  private async requireEditableDraft(id: string) {
    const row = await this.campaigns.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Draft not found');
    if (row.status !== 'draft' && row.status !== 'scheduled') {
      throw new BadRequestException(
        'Only a draft or scheduled email can be changed',
      );
    }
    return row;
  }

  private async resolveSelectors(selectors: string[], kind: EmailKind) {
    const parsed = this.assertSelectors(selectors);
    const candidates: ComposeCandidate[] = [];
    for (const selector of parsed) {
      candidates.push(...(await this.candidatesFor(selector)));
    }
    const unique = dedupeComposeRecipients(candidates);
    const suppressionRows = await this.suppressions.find();
    const suppressed = new Map(
      suppressionRows.map((row) => [row.email.toLowerCase(), row.reason]),
    );
    const recipients = unique.filter((person) => {
      if (!isDeliverableEmail(person.email)) return false;
      return includeRecipient({
        kind,
        marketingOptIn: person.marketingOptIn,
        suppression: suppressed.get(person.email),
      }).include;
    });
    return { recipients };
  }

  private async candidatesFor(
    selector: ParsedSelector,
  ): Promise<ComposeCandidate[]> {
    if (selector.type === 'allPaid') {
      const rows = await this.paidQuery().getMany();
      const content = await this.courseContent(
        rows.flatMap((row) => row.tracks ?? []),
      );
      return rows.map((row) => this.toCandidate(row, content.titles));
    }
    if (selector.type === 'course') {
      const course = await this.courses.findOne({
        where: { id: selector.courseId },
      });
      if (!course) return [];
      const rows = await this.paidQuery()
        .andWhere('e.tracks @> CAST(:track AS jsonb)', {
          track: JSON.stringify([course.slug]),
        })
        .getMany();
      const titles = new Map([[course.slug, course.name]]);
      return rows.map((row) => this.toCandidate(row, titles));
    }
    if (selector.type === 'ageGroup') {
      const rows = await this.paidQuery()
        .andWhere('e.date_of_birth IS NOT NULL')
        .andWhere(
          'EXTRACT(YEAR FROM age(e.date_of_birth)) BETWEEN :minAge AND :maxAge',
          { minAge: selector.min, maxAge: selector.max },
        )
        .getMany();
      const content = await this.courseContent(
        rows.flatMap((row) => row.tracks ?? []),
      );
      return rows.map((row) => this.toCandidate(row, content.titles));
    }
    if (selector.enrollmentId) {
      const row = await this.enrollments.findOne({
        where: { id: selector.enrollmentId },
      });
      if (!row || row.anonymisedAt) return [];
      const content = await this.courseContent(row.tracks ?? []);
      return [this.toCandidate(row, content.titles)];
    }
    const email = (selector.email ?? '').trim().toLowerCase();
    if (!email) return [];
    const rows = (await this.enrollments.find({ where: { email } })).filter(
      (row) => !row.anonymisedAt,
    );
    if (!rows.length) {
      return [
        {
          email,
          name: '',
          enrollmentId: null,
          courses: [],
          marketingOptIn: false,
        },
      ];
    }
    const content = await this.courseContent(
      rows.flatMap((row) => row.tracks ?? []),
    );
    return rows.map((row) => this.toCandidate(row, content.titles));
  }

  private paidQuery() {
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.payment_status = :paid', { paid: 'success' })
      .andWhere('e.anonymised_at IS NULL');
  }

  private toCandidate(
    row: EnterFirstEnrollmentEntity,
    titles: Map<string, string>,
  ): ComposeCandidate {
    return {
      email: row.email,
      name: `${row.firstName} ${row.lastName}`.trim(),
      enrollmentId: row.id,
      courses: (row.tracks ?? []).map((slug) => titles.get(slug) ?? slug),
      marketingOptIn: Boolean(row.marketingOptIn),
    };
  }

  private async courseContent(slugs: string[]) {
    const unique = [...new Set(slugs.filter(Boolean))];
    const titles = new Map<string, string>();
    const messages = new Map<string, string | null>();
    if (!unique.length) return { titles, messages };
    const found = await this.courses.find({ where: { slug: In(unique) } });
    for (const course of found) {
      titles.set(course.slug, course.name);
      messages.set(
        course.slug,
        course.afterPaymentEmail?.trim() ? course.afterPaymentEmail : null,
      );
    }
    return { titles, messages };
  }

  private async claimConfirmationIds(ids: string[]) {
    if (!ids.length) return [] as string[];
    const result = await this.enrollments
      .createQueryBuilder()
      .update(EnterFirstEnrollmentEntity)
      .set({
        confirmationEmailStatus: 'sending',
        confirmationEmailClaimedAt: () => 'NOW()',
        confirmationEmailError: null,
      })
      .where('id IN (:...ids)', { ids })
      .andWhere(CONFIRMATION_CLAIM_WHERE)
      .returning('*')
      .execute();
    return returnedIds(result.raw);
  }

  private async enqueueConfirmation(data: ConfirmationJobData) {
    if (this.queue) {
      try {
        await this.queue.add('enrollment-confirmation', data, {
          attempts: CONFIRMATION_EMAIL_ATTEMPTS,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        });
        return;
      } catch (error) {
        this.logger.warn(
          `Confirmation queue add failed, sending inline: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    for (
      let attempt = 1;
      attempt <= CONFIRMATION_EMAIL_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.deliverEnrollmentConfirmation(data);
        return;
      } catch (error) {
        if (attempt === CONFIRMATION_EMAIL_ATTEMPTS) {
          const reason = error instanceof Error ? error.message : String(error);
          await this.markConfirmationFailed(data.enrollmentIds, reason);
        }
      }
    }
  }

  private async deliverEnrollmentConfirmation(data: ConfirmationJobData) {
    const rows = await this.enrollments.find({
      where: { id: In(data.enrollmentIds), paymentStatus: 'success' },
    });
    const resend = data.idempotencyKey.includes('-resend-');
    const pending = rows.filter(
      (row) => resend || row.confirmationEmailStatus !== 'sent',
    );
    if (!pending.length) return;
    const content = await this.courseContent(
      pending.flatMap((row) => row.tracks ?? []),
    );
    const groups = new Map<string, EnterFirstEnrollmentEntity[]>();
    for (const row of pending) {
      const email = row.email.trim().toLowerCase();
      const list = groups.get(email) ?? [];
      list.push(row);
      groups.set(email, list);
    }
    let index = 0;
    for (const [email, group] of groups) {
      const ids = group.map((row) => row.id);
      const decision = deliverAddress(email, {
        allowlist: this.config.get('email.allowlist', { infer: true }),
        redirectTo: this.config.get('email.redirectTo', { infer: true }),
      });
      if (decision.action === 'skip') {
        await this.markConfirmationFailed(ids, decision.reason);
        continue;
      }
      const slugs: string[] = [];
      for (const row of group) {
        for (const slug of row.tracks ?? []) {
          if (!slugs.includes(slug)) slugs.push(slug);
        }
      }
      const rendered = renderEnrollmentConfirmation({
        studentName: group[0]?.firstName ?? 'there',
        courses: slugs.map((slug) => ({
          title: content.titles.get(slug) ?? slug,
          messageHtml: content.messages.get(slug) ?? null,
        })),
      });
      const idempotencyKey =
        groups.size === 1
          ? data.idempotencyKey
          : `${data.idempotencyKey}-${index}`;
      index += 1;
      await this.postResendOne({
        to: decision.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey,
      });
      await this.markConfirmationSent(ids);
    }
  }

  private async postResendOne(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) {
    const apiKey = this.config.get('email.apiKey', { infer: true });
    if (!apiKey) {
      this.logger.log(
        `[email-dry-run] confirmation to=${input.to} subject=${input.subject} key=${input.idempotencyKey}`,
      );
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.fromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      let message = `Resend failed (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* response was not JSON */
      }
      throw new Error(message);
    }
  }

  private async markConfirmationSent(ids: string[]) {
    if (!ids.length) return;
    await this.enrollments
      .createQueryBuilder()
      .update(EnterFirstEnrollmentEntity)
      .set({
        confirmationEmailStatus: 'sent',
        emailSentAt: () => 'NOW()',
        confirmationEmailError: null,
      })
      .where('id IN (:...ids)', { ids })
      .execute();
  }

  private async markConfirmationFailed(ids: string[], reason: string) {
    if (!ids.length) return;
    await this.enrollments
      .createQueryBuilder()
      .update(EnterFirstEnrollmentEntity)
      .set({
        confirmationEmailStatus: 'failed',
        confirmationEmailError: reason.slice(0, 2000),
      })
      .where('id IN (:...ids)', { ids })
      .andWhere("confirmation_email_status = 'sending'")
      .execute();
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
    selectors: row.selectors ?? [],
    scheduledAt: row.scheduledAt?.toISOString?.() ?? row.scheduledAt ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

type ComposeSample = {
  email: string;
  name: string;
  enrollmentId: string | null;
  courses: string[];
};

function toComposeSample(person: ComposeCandidate): ComposeSample {
  return {
    email: person.email,
    name: person.name,
    enrollmentId: person.enrollmentId,
    courses: person.courses,
  };
}

function toDraft(row: EmailCampaignEntity) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    html: row.html,
    text: row.text,
    kind: row.kind,
    selectors: row.selectors ?? [],
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString?.() ?? row.scheduledAt ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function returnedIds(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const ids: string[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
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
