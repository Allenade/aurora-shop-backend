import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { EnvTypes } from '@app/shared';
import { AuditLogType } from '@app/shared';
import { randomInt } from 'crypto';
import { Between, ILike, LessThan, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CoreSettingsService } from '../core-settings/core-settings.service';
import { CourseService } from '../course/course.service';
import { MailService } from '../mail/mail.service';
import { OpsHeartbeatService } from '../ops/ops-heartbeat.service';
import { evaluateCharge } from '../payment-gateway/paystack/charge-match';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import {
  TransactionStatus,
  type CallbackOutcome,
  type PaymentConfirmationSource,
} from '../payment-gateway/_contract/payment.types';
import { isMinor } from './age';
import type { EnterFirstEnrollDto } from './dto/enroll.dto';
import {
  EnterFirstEnrollmentEntity,
  type EnterFirstFormPayload,
  type EnterFirstPaymentStatus,
} from './entities/enter-first-enrollment.entity';
import { maskEmail, maskPhone } from './pii';

const PAYSTACK_CHANNELS = ['card', 'bank', 'ussd', 'qr', 'bank_transfer'];

@Injectable()
export class EnterFirstService {
  private readonly logger = new Logger(EnterFirstService.name);

  constructor(
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly paystack: PaystackProvider,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvTypes, true>,
    private readonly courses: CourseService,
    private readonly settings: CoreSettingsService,
    private readonly audit: AuditLogService,
    private readonly heartbeat: OpsHeartbeatService,
  ) {}

  async enroll(
    dto: EnterFirstEnrollDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const tracks = [
      ...new Set(dto.tracks.map((t) => t.trim()).filter(Boolean)),
    ];
    if (!tracks.length) {
      throw new BadRequestException('Select at least one track');
    }
    if (dto.dateOfBirth && isMinor(dto.dateOfBirth)) {
      if (
        !dto.guardianName?.trim() ||
        !dto.guardianEmail?.trim() ||
        !dto.guardianConsent
      ) {
        throw new BadRequestException(
          'A guardian name, email, and consent are required for students under 18',
        );
      }
    }

    const priced = await this.courses.quote(tracks);
    if (priced.errors.length) {
      throw new BadRequestException(priced.errors.join('; '));
    }

    const legal = await this.settings.get();
    const form: EnterFirstFormPayload = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      middleName: dto.middleName?.trim(),
      gender: dto.gender?.trim(),
      nationality: dto.nationality?.trim(),
      stateOfResidence: dto.stateOfResidence?.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone.trim(),
      whatsapp: dto.whatsapp?.trim() || dto.phone.trim(),
      currentStatus: dto.currentStatus?.trim(),
      institution: dto.institution?.trim(),
      experienceLevel: dto.experienceLevel?.trim(),
      howDidYouHear: dto.howDidYouHear?.trim(),
      joinedCommunity: dto.joinedCommunity?.trim(),
    };

    const reference = this.nextReference();
    const row = await this.enrollments.save(
      this.enrollments.create({
        source: 'enter_first',
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        tracks,
        amount: priced.amount,
        currency: priced.currency,
        paymentStatus: 'pending',
        paystackReference: reference,
        form,
        termsVersion: dto.termsVersion?.trim() || legal.termsVersion,
        privacyVersion: dto.privacyVersion?.trim() || legal.privacyVersion,
        consentAt: new Date(),
        marketingOptIn: !!dto.marketingOptIn,
        consentIp: meta.ip?.slice(0, 64) ?? null,
        consentUserAgent: meta.userAgent?.slice(0, 512) ?? null,
        ageConfirmed: true,
        dateOfBirth: dto.dateOfBirth ?? null,
        guardianName: dto.guardianName?.trim() || null,
        guardianEmail: dto.guardianEmail?.trim().toLowerCase() || null,
        guardianConsent: !!dto.guardianConsent,
        chargedLines: priced.lines,
        cohorts: priced.cohorts,
      }),
    );

    if (priced.amount <= 0) {
      row.paymentStatus = 'success';
      row.paidAt = new Date();
      row.paidAmount = 0;
      row.paidCurrency = priced.currency;
      await this.enrollments.save(row);
      await this.sendConfirmationIfNeeded(row);
      return {
        enrollment: this.toDto(row, false),
        payment: this.paymentPayload(row, reference, null, true),
      };
    }

    const website = this.websiteOrigin();
    const registered = await this.paystack.register({
      amount: priced.amount,
      reference,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      callbackUrl: `${website}/core-3/enroll?pay=${encodeURIComponent(reference)}`,
      channels: PAYSTACK_CHANNELS,
      metadata: {
        product: 'enter_first',
        enrollmentId: row.id,
        tracks,
      },
    });

    row.paystackReference = registered.externalReference ?? reference;
    row.authorizationUrl =
      registered.authorizationUrl ?? registered.redirectUrl;
    await this.enrollments.save(row);

    return {
      enrollment: this.toDto(row, false),
      payment: this.paymentPayload(
        row,
        row.paystackReference ?? reference,
        registered.publicKey ?? null,
        false,
      ),
    };
  }

  async handleProviderCallback(outcome: CallbackOutcome) {
    const reference = outcome.externalReference?.trim();
    if (!reference) return { handled: false };
    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) return { handled: false };
    if (row.paymentStatus === 'success' || row.paymentStatus === 'refunded') {
      return { handled: true, alreadyPaid: true };
    }
    await this.applyVerified(row, outcome, outcome.confirmedVia ?? 'webhook');
    this.heartbeat.beat('paystack_webhook');
    return { handled: true, enrollmentId: row.id, status: row.paymentStatus };
  }

  async statusByReference(reference: string) {
    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (
      row.paymentStatus === 'pending' &&
      row.amount > 0 &&
      row.reconciliationException !== 'amount_mismatch'
    ) {
      const outcome = await this.paystack.verifyReference(
        row.paystackReference ?? reference,
      );
      if (outcome.status !== TransactionStatus.PENDING) {
        await this.applyVerified(row, outcome, 'poll');
        const fresh = await this.enrollments.findOne({ where: { id: row.id } });
        if (fresh) return this.toStatusDto(fresh);
      }
    }
    return this.toStatusDto(row);
  }

  async reverify(id: string, actorId?: string) {
    const row = await this.findOrThrow(id);
    if (row.amount <= 0) return this.toDto(row, false);
    const outcome = await this.paystack.verifyReference(
      row.paystackReference ?? row.id,
    );
    await this.applyVerified(row, outcome, 'admin');
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENROLLMENT_REVERIFIED',
      userId: actorId,
      resourceType: 'enter_first_enrollment',
      resourceId: row.id,
    });
    const fresh = await this.findOrThrow(id);
    return this.toDto(fresh, false);
  }

  async resendConfirmation(id: string, actorId?: string) {
    const row = await this.findOrThrow(id);
    if (row.paymentStatus !== 'success') {
      throw new BadRequestException('Enrollment is not paid');
    }
    row.emailSentAt = undefined;
    await this.sendConfirmationIfNeeded(row, true);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENROLLMENT_CONFIRMATION_RESENT',
      userId: actorId,
      resourceType: 'enter_first_enrollment',
      resourceId: row.id,
    });
    const fresh = await this.findOrThrow(id);
    return this.toDto(fresh, false);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reverifyPending() {
    const now = Date.now();
    const newest = new Date(now - 2 * 60 * 1000);
    const oldest = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const rows = await this.enrollments.find({
      where: {
        paymentStatus: 'pending',
        createdAt: Between(oldest, newest),
      },
      take: 40,
      order: { createdAt: 'ASC' },
    });
    for (const row of rows) {
      if (row.amount <= 0) continue;
      if (row.reconciliationException === 'amount_mismatch') continue;
      if (!row.paystackReference) continue;
      try {
        const outcome = await this.paystack.verifyReference(
          row.paystackReference,
        );
        if (outcome.status === TransactionStatus.PENDING) continue;
        await this.applyVerified(row, outcome, 'poll');
      } catch (error) {
        this.logger.warn(
          `Re-verify failed for ${row.paystackReference}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.heartbeat.beat('reconciliation');
  }

  async list(opts: {
    q?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
    maskPii?: boolean;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
    const where: Record<string, unknown>[] = [];
    const statusFilter = opts.paymentStatus
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) as EnterFirstPaymentStatus[] | undefined;

    if (opts.q?.trim()) {
      const q = `%${opts.q.trim()}%`;
      const base = statusFilter?.length
        ? statusFilter.map((paymentStatus) => ({ paymentStatus }))
        : [{}];
      for (const statusWhere of base) {
        where.push(
          { ...statusWhere, firstName: ILike(q) },
          { ...statusWhere, lastName: ILike(q) },
          { ...statusWhere, email: ILike(q) },
          { ...statusWhere, paystackReference: ILike(q) },
        );
      }
    } else if (statusFilter?.length) {
      for (const paymentStatus of statusFilter) where.push({ paymentStatus });
    }

    const [items, total] = await this.enrollments.findAndCount({
      where: where.length ? where : undefined,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((row) => this.toDto(row, !!opts.maskPii)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string, maskPii = false) {
    const row = await this.findOrThrow(id);
    return this.toDto(row, maskPii);
  }

  async findOrThrow(id: string) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    return row;
  }

  /** Used by the retention job. */
  async anonymise(row: EnterFirstEnrollmentEntity) {
    row.firstName = 'Redacted';
    row.lastName = 'Subject';
    row.email = `anon+${row.id}@redacted.invalid`;
    row.phone = undefined;
    row.form = {
      firstName: 'Redacted',
      lastName: 'Subject',
      email: row.email,
    };
    row.guardianName = null;
    row.guardianEmail = null;
    row.dateOfBirth = null;
    row.consentIp = null;
    row.consentUserAgent = null;
    row.marketingOptIn = false;
    await this.enrollments.save(row);
  }

  stalePendingCutoff(hours = 24) {
    return LessThan(new Date(Date.now() - hours * 60 * 60 * 1000));
  }

  private async applyVerified(
    row: EnterFirstEnrollmentEntity,
    outcome: CallbackOutcome,
    via: PaymentConfirmationSource,
  ) {
    if (row.paymentStatus === 'success' || row.paymentStatus === 'refunded') {
      return row;
    }
    if (outcome.status === TransactionStatus.PENDING) return row;

    row.paystackTransactionId =
      outcome.paystackTransactionId ?? row.paystackTransactionId;
    row.paidAmount = outcome.amount ?? row.paidAmount;
    row.paidCurrency = outcome.currency ?? row.paidCurrency;
    row.paymentChannel = outcome.channel ?? row.paymentChannel;
    row.verifiedAt = new Date();
    row.confirmedVia = via;

    if (outcome.status === TransactionStatus.FAILED) {
      row.paymentStatus = 'failed';
      await this.enrollments.save(row);
      return row;
    }

    const verdict = evaluateCharge(
      { amount: row.amount, currency: row.currency },
      {
        amount: outcome.amount,
        currency: outcome.currency,
        mock: outcome.metadata?.mode === 'mock',
      },
    );
    if (verdict !== 'match') {
      row.reconciliationException = 'amount_mismatch';
      await this.enrollments.save(row);
      this.logger.warn(`Amount mismatch for enrollment ${row.id}`);
      return row;
    }

    row.reconciliationException = null;
    row.paymentStatus = 'success';
    row.paidAt = row.paidAt ?? new Date();
    if (outcome.metadata?.mode === 'mock') {
      row.paidAmount = row.amount;
      row.paidCurrency = row.currency;
    }
    await this.enrollments.save(row);
    await this.sendConfirmationIfNeeded(row);
    return row;
  }

  private async sendConfirmationIfNeeded(
    row: EnterFirstEnrollmentEntity,
    force = false,
  ) {
    if (row.emailSentAt && !force) return;
    try {
      await this.mail.sendEnterFirstConfirmation({
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        tracks: row.tracks,
        amount: row.amount,
        currency: row.currency,
        reference: row.paystackReference ?? row.id,
      });
      row.emailSentAt = new Date();
      await this.enrollments.save(row);
    } catch (error) {
      this.logger.error(
        `Enter First confirmation email failed for ${row.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private nextReference() {
    return `EF-${Date.now()}-${randomInt(100, 999)}`;
  }

  private websiteOrigin() {
    const dedicated = this.config.get('website.url', { infer: true });
    if (dedicated) return dedicated.replace(/\/$/, '');
    const origins = this.config.get('frontend.allowedOrigins', { infer: true });
    return (origins[0] ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private paymentPayload(
    row: EnterFirstEnrollmentEntity,
    reference: string,
    publicKey: string | null,
    free: boolean,
  ) {
    return {
      provider: 'paystack' as const,
      reference,
      authorizationUrl: free ? null : (row.authorizationUrl ?? null),
      publicKey:
        publicKey ?? this.config.get('paystack.publicKey', { infer: true }),
      amount: row.amount,
      currency: row.currency,
      channels: PAYSTACK_CHANNELS,
      free,
    };
  }

  private toStatusDto(row: EnterFirstEnrollmentEntity) {
    return {
      reference: row.paystackReference ?? null,
      status: row.paymentStatus,
      paid: row.paymentStatus === 'success',
      amount: row.amount,
      currency: row.currency,
      tracks: row.tracks,
      enrollmentId: row.id,
      reconciliationException: row.reconciliationException ?? null,
    };
  }

  private toDto(row: EnterFirstEnrollmentEntity, maskPii: boolean) {
    const email = maskPii ? maskEmail(row.email) : row.email;
    const phone = maskPii ? maskPhone(row.phone) : (row.phone ?? null);
    return {
      id: row.id,
      source: row.source,
      firstName: maskPii ? row.firstName.slice(0, 1) : row.firstName,
      lastName: maskPii ? row.lastName.slice(0, 1) : row.lastName,
      email,
      phone,
      tracks: row.tracks,
      cohorts: row.cohorts ?? [],
      amount: row.amount,
      currency: row.currency,
      chargedLines: row.chargedLines ?? [],
      paymentStatus: row.paymentStatus,
      paystackReference: row.paystackReference ?? null,
      paystackTransactionId: row.paystackTransactionId ?? null,
      authorizationUrl: maskPii ? null : (row.authorizationUrl ?? null),
      paidAt: row.paidAt?.toISOString() ?? null,
      paidAmount: row.paidAmount ?? null,
      paidCurrency: row.paidCurrency ?? null,
      paymentChannel: row.paymentChannel ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      confirmedVia: row.confirmedVia ?? null,
      reconciliationException: row.reconciliationException ?? null,
      termsVersion: row.termsVersion ?? null,
      privacyVersion: row.privacyVersion ?? null,
      consentAt: row.consentAt?.toISOString() ?? null,
      marketingOptIn: row.marketingOptIn ?? false,
      ageConfirmed: row.ageConfirmed ?? false,
      dateOfBirth: maskPii ? null : (row.dateOfBirth ?? null),
      guardianName: maskPii ? null : (row.guardianName ?? null),
      guardianEmail: maskPii
        ? maskEmail(row.guardianEmail)
        : (row.guardianEmail ?? null),
      guardianConsent: row.guardianConsent ?? false,
      form: maskPii ? maskForm(row.form) : row.form,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}

function maskForm(form: EnterFirstFormPayload): EnterFirstFormPayload {
  return {
    ...form,
    email: maskEmail(form.email) ?? '',
    phone: maskPhone(form.phone) ?? undefined,
    whatsapp: maskPhone(form.whatsapp) ?? undefined,
    firstName: form.firstName?.slice(0, 1),
    lastName: form.lastName?.slice(0, 1),
  };
}
