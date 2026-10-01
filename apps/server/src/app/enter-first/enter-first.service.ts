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
import { randomInt } from 'crypto';
import { ILike, LessThan, MoreThan, Repository } from 'typeorm';
import { CourseService } from '../course/course.service';
import { MailService } from '../mail/mail.service';
import {
  TransactionStatus,
  type CallbackOutcome,
  type ConfirmationSource,
} from '../payment-gateway/_contract/payment.types';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import { reconcileProviderStatus } from '../payment-gateway/paystack/reconcile-charge';
import { isUnder18 } from './age';
import type { EnterFirstEnrollDto } from './dto/enroll.dto';
import {
  EnterFirstEnrollmentEntity,
  type EnterFirstFormPayload,
  type EnterFirstPaymentStatus,
} from './entities/enter-first-enrollment.entity';
import { maskEmail, maskName, maskPhone } from './pii';

export type EnrollRequestMeta = {
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class EnterFirstService {
  private readonly logger = new Logger(EnterFirstService.name);

  constructor(
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly courses: CourseService,
    private readonly paystack: PaystackProvider,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async enroll(dto: EnterFirstEnrollDto, meta: EnrollRequestMeta = {}) {
    if (dto.termsAccepted === false) {
      throw new BadRequestException('Terms must be accepted');
    }
    if (dto.ageConfirmed === false) {
      throw new BadRequestException('Age must be confirmed');
    }
    if (dto.dateOfBirth && isUnder18(dto.dateOfBirth)) {
      if (
        !dto.guardianName?.trim() ||
        !dto.guardianEmail?.trim() ||
        dto.guardianConsent !== true
      ) {
        throw new BadRequestException(
          'Guardian name, email, and consent are required when the student is under 18',
        );
      }
    }

    const tracks = [
      ...new Set(dto.tracks.map((t) => t.trim()).filter(Boolean)),
    ];
    const priced = await this.courses.quote(tracks);

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

    const minor = dto.dateOfBirth ? isUnder18(dto.dateOfBirth) : null;
    const consented = Boolean(
      dto.termsAccepted || dto.termsVersion || dto.privacyVersion,
    );
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
        priceSnapshot: priced.lines,
        paymentStatus: 'pending',
        paystackReference: reference,
        form,
        termsVersion: dto.termsVersion?.trim() || null,
        privacyVersion: dto.privacyVersion?.trim() || null,
        consentAt: consented ? new Date() : null,
        marketingOptIn: dto.marketingOptIn === true,
        consentIp: meta.ip?.slice(0, 64) || null,
        consentUserAgent: meta.userAgent?.slice(0, 512) || null,
        ageConfirmed: dto.ageConfirmed ?? null,
        dateOfBirth: dto.dateOfBirth ?? null,
        isMinor: minor,
        guardianName: dto.guardianName?.trim() || null,
        guardianEmail: dto.guardianEmail?.trim().toLowerCase() || null,
        guardianConsent: dto.guardianConsent ?? null,
        guardianConsentAt: dto.guardianConsent ? new Date() : null,
        amountMismatch: false,
        currencyMismatch: false,
      }),
    );

    if (priced.amount <= 0) {
      row.paymentStatus = 'success';
      row.paidAt = new Date();
      row.paidAmount = 0;
      row.paidCurrency = priced.currency;
      row.confirmationSource = 'poll';
      row.verifiedAt = new Date();
      await this.enrollments.save(row);
      await this.sendConfirmationIfNeeded(row);
      return {
        enrollment: this.toDto(row),
        payment: {
          provider: 'paystack' as const,
          reference,
          authorizationUrl: null,
          publicKey: this.config.get('paystack.publicKey', { infer: true }),
          amount: 0,
          currency: priced.currency,
          free: true,
          channels: [] as string[],
        },
      };
    }

    const website = this.websiteOrigin();
    const channels = ['card', 'bank', 'ussd', 'bank_transfer'];
    const registered = await this.paystack.register({
      amount: priced.amount,
      reference,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      callbackUrl: `${website}/core-3/enroll?pay=${encodeURIComponent(reference)}`,
      channels,
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
      enrollment: this.toDto(row),
      payment: {
        provider: 'paystack' as const,
        reference: row.paystackReference,
        authorizationUrl: row.authorizationUrl ?? null,
        publicKey: registered.publicKey,
        amount: priced.amount,
        currency: priced.currency,
        free: false,
        channels,
      },
    };
  }

  /**
   * Called from the shared Paystack webhook when no shop transaction matches.
   */
  async handleProviderCallback(
    outcome: CallbackOutcome,
    source: ConfirmationSource = 'webhook',
  ) {
    if (outcome.signatureValid === false) return { handled: false };
    const reference = outcome.externalReference?.trim();
    if (!reference) return { handled: false };

    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) return { handled: false };
    await this.applyPaymentOutcome(row, outcome, source);
    return {
      handled: true,
      enrollmentId: row.id,
      status: row.paymentStatus,
    };
  }

  async statusByReference(reference: string) {
    const row = await this.enrollments.findOne({
      where: { paystackReference: reference },
    });
    if (!row) throw new NotFoundException('Enrollment not found');

    if (
      row.paymentStatus === 'pending' &&
      row.amount > 0 &&
      !row.amountMismatch
    ) {
      await this.reverifyRow(row, 'poll');
      const fresh = await this.enrollments.findOne({ where: { id: row.id } });
      if (fresh) return this.toStatusDto(fresh);
    }

    return this.toStatusDto(row);
  }

  async reverifyById(id: string, source: ConfirmationSource) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (row.amount <= 0) return this.toDto(row);
    await this.reverifyRow(row, source);
    const fresh = await this.enrollments.findOne({ where: { id } });
    return this.toDto(fresh ?? row);
  }

  async resendConfirmation(id: string) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    if (row.paymentStatus !== 'success') {
      throw new BadRequestException('Enrollment is not paid');
    }
    row.emailSentAt = undefined;
    await this.sendConfirmationIfNeeded(row, true);
    const fresh = await this.enrollments.findOne({ where: { id } });
    return this.toDto(fresh ?? row);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reverifyPendingEnrollments() {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const rows = await this.enrollments.find({
      where: {
        paymentStatus: 'pending',
        amount: MoreThan(0),
        createdAt: LessThan(cutoff),
      },
      order: { createdAt: 'ASC' },
      take: 40,
    });
    for (const row of rows) {
      if (!row.paystackReference) continue;
      try {
        await this.reverifyRow(row, 'poll');
      } catch (error) {
        this.logger.warn(
          `Re-verify failed for ${row.paystackReference}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
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
      for (const paymentStatus of statusFilter) {
        where.push({ paymentStatus });
      }
    }

    const [items, total] = await this.enrollments.findAndCount({
      where: where.length ? where : undefined,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((row) => this.toDto(row, opts.maskPii)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string, maskPii = false) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    return this.toDto(row, maskPii);
  }

  async anonymise(row: EnterFirstEnrollmentEntity) {
    const token = row.id.slice(0, 8);
    row.firstName = 'Redacted';
    row.lastName = token;
    row.email = `anon+${row.id}@redacted.invalid`;
    row.phone = undefined;
    row.form = {
      firstName: 'Redacted',
      lastName: token,
      email: row.email,
    };
    row.guardianName = null;
    row.guardianEmail = null;
    row.consentIp = null;
    row.consentUserAgent = null;
    row.dateOfBirth = null;
    row.marketingOptIn = false;
    row.anonymisedAt = new Date();
    await this.enrollments.save(row);
    return row;
  }

  private async reverifyRow(
    row: EnterFirstEnrollmentEntity,
    source: ConfirmationSource,
  ) {
    const reference = row.paystackReference;
    if (!reference) return;
    const outcome = await this.paystack.verifyReference(reference, {
      amount: row.amount,
      currency: row.currency,
    });
    await this.applyPaymentOutcome(row, outcome, source);
  }

  private async applyPaymentOutcome(
    row: EnterFirstEnrollmentEntity,
    outcome: CallbackOutcome,
    source: ConfirmationSource,
  ) {
    if (row.paymentStatus === 'success' || row.paymentStatus === 'refunded') {
      return;
    }
    const decision = reconcileProviderStatus({
      providerStatus: outcome.status,
      charge: outcome.charge,
      expectedAmount: row.amount,
      expectedCurrency: row.currency,
    });
    if (decision.charge.transactionId) {
      row.paystackTransactionId = decision.charge.transactionId;
    }
    if (typeof decision.charge.paidAmount === 'number') {
      row.paidAmount = decision.charge.paidAmount;
    }
    if (decision.charge.currency) row.paidCurrency = decision.charge.currency;
    if (decision.charge.channel) row.paystackChannel = decision.charge.channel;
    if (outcome.status !== TransactionStatus.PENDING) {
      row.amountMismatch = !decision.amountMatches;
      row.currencyMismatch = !decision.currencyMatches;
      row.verifiedAt = new Date();
      row.confirmationSource = source;
    }
    if (decision.status === TransactionStatus.SUCCESS) {
      row.paymentStatus = 'success';
      row.paidAt = row.paidAt ?? new Date();
      row.amountMismatch = false;
      row.currencyMismatch = false;
      await this.enrollments.save(row);
      await this.sendConfirmationIfNeeded(row);
      return;
    }
    if (decision.status === TransactionStatus.FAILED) {
      row.paymentStatus = 'failed';
    }
    await this.enrollments.save(row);
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

  private toStatusDto(row: EnterFirstEnrollmentEntity) {
    return {
      reference: row.paystackReference ?? null,
      status: row.paymentStatus,
      paid: row.paymentStatus === 'success',
      amount: row.amount,
      currency: row.currency,
      tracks: row.tracks,
      enrollmentId: row.id,
      amountMismatch: row.amountMismatch,
      currencyMismatch: row.currencyMismatch,
    };
  }

  private toDto(row: EnterFirstEnrollmentEntity, maskPii = false) {
    const email = maskPii ? maskEmail(row.email) : row.email;
    const phone = maskPii ? maskPhone(row.phone) : (row.phone ?? null);
    return {
      id: row.id,
      source: row.source,
      firstName: maskPii ? maskName(row.firstName) : row.firstName,
      lastName: maskPii ? maskName(row.lastName) : row.lastName,
      email,
      phone,
      tracks: row.tracks,
      amount: row.amount,
      currency: row.currency,
      priceSnapshot: row.priceSnapshot ?? [],
      paymentStatus: row.paymentStatus,
      paystackReference: row.paystackReference ?? null,
      authorizationUrl: maskPii ? null : (row.authorizationUrl ?? null),
      paystackTransactionId: row.paystackTransactionId ?? null,
      paidAmount: row.paidAmount ?? null,
      paidCurrency: row.paidCurrency ?? null,
      paystackChannel: row.paystackChannel ?? null,
      verifiedAt: row.verifiedAt?.toISOString?.() ?? row.verifiedAt ?? null,
      confirmationSource: row.confirmationSource ?? null,
      amountMismatch: row.amountMismatch ?? false,
      currencyMismatch: row.currencyMismatch ?? false,
      paidAt: row.paidAt?.toISOString() ?? null,
      form: maskPii
        ? {
            email: email ?? '***',
            firstName: maskName(row.firstName) ?? '***',
            lastName: maskName(row.lastName) ?? '***',
          }
        : row.form,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,
      termsVersion: row.termsVersion ?? null,
      privacyVersion: row.privacyVersion ?? null,
      consentAt: row.consentAt?.toISOString?.() ?? row.consentAt ?? null,
      marketingOptIn: row.marketingOptIn ?? false,
      consentIp: maskPii ? null : (row.consentIp ?? null),
      consentUserAgent: maskPii ? null : (row.consentUserAgent ?? null),
      ageConfirmed: row.ageConfirmed ?? null,
      dateOfBirth: maskPii ? null : (row.dateOfBirth ?? null),
      isMinor: row.isMinor ?? null,
      guardianName: maskPii
        ? maskName(row.guardianName)
        : (row.guardianName ?? null),
      guardianEmail: maskPii
        ? maskEmail(row.guardianEmail)
        : (row.guardianEmail ?? null),
      guardianConsent: row.guardianConsent ?? null,
      guardianConsentAt:
        row.guardianConsentAt?.toISOString?.() ?? row.guardianConsentAt ?? null,
      anonymisedAt:
        row.anonymisedAt?.toISOString?.() ?? row.anonymisedAt ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    };
  }
}
