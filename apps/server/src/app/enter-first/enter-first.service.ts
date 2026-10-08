import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType, type EnvTypes } from '@app/shared';
import { randomInt } from 'crypto';
import { DataSource, In, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CourseService } from '../course/course.service';
import { EmailService } from '../email/email.service';
import { ADVISORY_LOCK, withAdvisoryLock } from '../../common/db/advisory-lock';
import { queryRows } from '../../common/db/query-rows';
import {
  TransactionStatus,
  type CallbackOutcome,
  type ConfirmationSource,
} from '../payment-gateway/_contract/payment.types';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import { reconcileProviderStatus } from '../payment-gateway/paystack/reconcile-charge';
import { CORE_30_PROGRAM } from '../program/core30';
import { RefundRequestEntity } from '../refund/entities/refund-request.entity';
import { UserRepository } from '../user/repositories/user.repository';
import { completedAge, dateOnly, isUnder18 } from './age';
import type { EnterFirstEnrollDto } from './dto/enroll.dto';
import { enrollmentsToCsv } from './enrollment-csv';
import {
  ENROLLMENT_EXPORT_ROW_CAP,
  applyEnrollmentFilters,
  splitTrackTokens,
  type ParsedEnrollmentListQuery,
} from './enrollment-list-filters';
import {
  enrollmentClearDecision,
  enrollmentDeleteDecision,
  isSuperAdminRole,
  roleSlugs,
} from './enrollment-removal';
import {
  EnterFirstEnrollmentEntity,
  type EnterFirstFormPayload,
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
    private readonly emails: EmailService,
    private readonly config: ConfigService<EnvTypes, true>,
    private readonly audit: AuditLogService,
    private readonly users: UserRepository,
    private readonly dataSource: DataSource,
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
        program: CORE_30_PROGRAM,
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
        program: CORE_30_PROGRAM,
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
    await this.emails.resendEnrollmentConfirmation(id);
    const fresh = await this.enrollments.findOne({ where: { id } });
    if (!fresh) throw new NotFoundException('Enrollment not found');
    return this.toDto(fresh);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reverifyPendingEnrollments() {
    await withAdvisoryLock(
      this.dataSource,
      ADVISORY_LOCK.enrollmentReverify,
      () => this.reverifyPendingBatch(),
    );
  }

  private async reverifyPendingBatch() {
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
    await this.queueUnsentConfirmations();
  }

  /** Crash recovery: paid rows that never claimed a confirmation. */
  private async queueUnsentConfirmations() {
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .where('e.payment_status = :paid', { paid: 'success' })
      .andWhere('e.amount > 0')
      .andWhere('e.email_sent_at IS NULL')
      .andWhere('e.paystack_reference IS NOT NULL')
      .andWhere(
        '(e.confirmation_email_status IS NULL OR e.confirmation_email_status = :pending)',
        { pending: 'pending' },
      )
      .orderBy('e.paid_at', 'ASC')
      .take(40)
      .getMany();
    for (const row of rows) {
      if (!row.paystackReference) continue;
      try {
        await this.emails.claimAndQueueConfirmation(row.paystackReference);
      } catch (error) {
        this.logger.warn(
          `Confirmation queue failed for ${row.paystackReference}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async list(query: ParsedEnrollmentListQuery, maskPii = false) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const filters = await this.enrollmentFilters(query);
    const qb = this.enrollments.createQueryBuilder('e');
    applyEnrollmentFilters(qb, filters);
    const [items, total] = await qb
      .orderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      program: filters.program,
      items: items.map((row) => this.toDto(row, maskPii)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async exportCsv(query: ParsedEnrollmentListQuery, maskPii = false) {
    const qb = this.enrollments.createQueryBuilder('e');
    applyEnrollmentFilters(qb, await this.enrollmentFilters(query));
    const rows = await qb
      .orderBy('e.createdAt', 'ASC')
      .take(ENROLLMENT_EXPORT_ROW_CAP + 1)
      .getMany();
    const truncated = rows.length > ENROLLMENT_EXPORT_ROW_CAP;
    return {
      csv: enrollmentsToCsv(
        truncated ? rows.slice(0, ENROLLMENT_EXPORT_ROW_CAP) : rows,
        maskPii,
      ),
      truncated,
    };
  }

  async getById(id: string, maskPii = false) {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Enrollment not found');
    return this.toDto(row, maskPii);
  }

  /**
   * Super admin only. Soft-deletes one Payments-list enrollment.
   * Refund requests for that enrollment are soft-deleted first so a foreign
   * key cannot reject the delete. Paystack is not called.
   */
  async remove(id: string, actorId?: string) {
    const actor = actorId ? await this.users.findByIdWithRoles(actorId) : null;
    const row = await this.enrollments.findOne({ where: { id } });
    const decision = enrollmentDeleteDecision({
      actorId,
      actorIsSuperAdmin: isSuperAdminRole(roleSlugs(actor?.roleAssignments)),
      targetExists: Boolean(row),
    });
    if (!decision.ok) {
      if (decision.status === 404) {
        throw new NotFoundException(decision.message);
      }
      throw new ForbiddenException(decision.message);
    }
    if (!row) throw new NotFoundException('Enrollment not found');

    let refundsRemoved = 0;
    await this.enrollments.manager.transaction(async (manager) => {
      const refunds = await manager.softDelete(RefundRequestEntity, {
        enrollmentId: row.id,
      });
      refundsRemoved = refunds.affected ?? 0;
      await manager.softDelete(EnterFirstEnrollmentEntity, row.id);
    });

    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENROLLMENT_DELETED',
      userId: actorId,
      resourceType: 'enrollment',
      resourceId: row.id,
      metadata: {
        program: row.program,
        paymentStatus: row.paymentStatus,
        paystackReference: row.paystackReference ?? null,
        refundsRemoved,
      },
    });
    return { ok: true, id: row.id };
  }

  /**
   * Super admin only. Soft-deletes every enrollment on the Payments list.
   * Refund requests for those enrollments are soft-deleted first so a foreign
   * key cannot reject the delete. Paystack is not called.
   */
  async clearAll(actorId?: string) {
    const actor = actorId ? await this.users.findByIdWithRoles(actorId) : null;
    const decision = enrollmentClearDecision({
      actorId,
      actorIsSuperAdmin: isSuperAdminRole(roleSlugs(actor?.roleAssignments)),
    });
    if (!decision.ok) throw new ForbiddenException(decision.message);

    const rows = await this.enrollments.find({ select: { id: true } });
    let refundsRemoved = 0;
    if (rows.length > 0) {
      const ids = rows.map((row) => row.id);
      await this.enrollments.manager.transaction(async (manager) => {
        const refunds = await manager.softDelete(RefundRequestEntity, {
          enrollmentId: In(ids),
        });
        refundsRemoved = refunds.affected ?? 0;
        await manager.softDelete(EnterFirstEnrollmentEntity, { id: In(ids) });
      });
    }

    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'ENROLLMENTS_CLEARED',
      userId: actorId,
      resourceType: 'enrollment',
      metadata: { removed: rows.length, refundsRemoved },
    });
    return { ok: true, removed: rows.length };
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
    if (row.paymentStatus === 'success') {
      if (row.paystackReference) {
        await this.emails.claimAndQueueConfirmation(row.paystackReference);
      }
      return;
    }
    if (row.paymentStatus === 'refunded') return;

    const decision = reconcileProviderStatus({
      providerStatus: outcome.status,
      charge: outcome.charge,
      expectedAmount: row.amount,
      expectedCurrency: row.currency,
    });
    const tx = decision.charge.transactionId ?? null;
    const paidAmount =
      typeof decision.charge.paidAmount === 'number'
        ? decision.charge.paidAmount
        : null;
    const paidCurrency = decision.charge.currency ?? null;
    const channel = decision.charge.channel ?? null;

    if (decision.status === TransactionStatus.SUCCESS) {
      const updated = queryRows(
        await this.enrollments.query(
          `UPDATE enter_first_enrollment
         SET payment_status = 'success',
             paid_at = COALESCE(paid_at, NOW()),
             paystack_transaction_id = COALESCE($2, paystack_transaction_id),
             paid_amount = COALESCE($3, paid_amount),
             paid_currency = COALESCE($4, paid_currency),
             paystack_channel = COALESCE($5, paystack_channel),
             amount_mismatch = false,
             currency_mismatch = false,
             verified_at = NOW(),
             confirmation_source = $6,
             updated_at = NOW()
         WHERE id = $1
           AND payment_status NOT IN ('success', 'refunded')
           AND deleted_at IS NULL
         RETURNING id, paystack_reference`,
          [row.id, tx, paidAmount, paidCurrency, channel, source],
        ),
      );
      const changed = updated[0] ?? null;
      if (!changed) return;
      row.paymentStatus = 'success';
      row.paidAt = row.paidAt ?? new Date();
      row.amountMismatch = false;
      row.currencyMismatch = false;
      row.verifiedAt = new Date();
      row.confirmationSource = source;
      const reference =
        typeof changed.paystack_reference === 'string'
          ? changed.paystack_reference
          : row.paystackReference;
      if (reference) await this.emails.claimAndQueueConfirmation(reference);
      return;
    }

    if (decision.status === TransactionStatus.FAILED) {
      const updated = queryRows(
        await this.enrollments.query(
          `UPDATE enter_first_enrollment
         SET payment_status = 'failed',
             paystack_transaction_id = COALESCE($2, paystack_transaction_id),
             paid_amount = COALESCE($3, paid_amount),
             paid_currency = COALESCE($4, paid_currency),
             paystack_channel = COALESCE($5, paystack_channel),
             amount_mismatch = $6,
             currency_mismatch = $7,
             verified_at = NOW(),
             confirmation_source = $8,
             updated_at = NOW()
         WHERE id = $1
           AND payment_status NOT IN ('success', 'refunded')
           AND deleted_at IS NULL
         RETURNING id`,
          [
            row.id,
            tx,
            paidAmount,
            paidCurrency,
            channel,
            !decision.amountMatches,
            !decision.currencyMatches,
            source,
          ],
        ),
      );
      if (updated[0]) row.paymentStatus = 'failed';
      return;
    }

    if (tx || paidAmount != null || paidCurrency || channel) {
      await this.enrollments.query(
        `UPDATE enter_first_enrollment
         SET paystack_transaction_id = COALESCE($2, paystack_transaction_id),
             paid_amount = COALESCE($3, paid_amount),
             paid_currency = COALESCE($4, paid_currency),
             paystack_channel = COALESCE($5, paystack_channel),
             updated_at = NOW()
         WHERE id = $1
           AND payment_status NOT IN ('success', 'refunded')
           AND deleted_at IS NULL`,
        [row.id, tx, paidAmount, paidCurrency, channel],
      );
    }
  }

  private nextReference() {
    return `EF-${Date.now()}-${randomInt(100, 999)}`;
  }

  private async enrollmentFilters(query: ParsedEnrollmentListQuery) {
    const { ids, slugs } = splitTrackTokens(query.trackTokens);
    const resolved = new Set(slugs);
    let forceEmpty = query.forceEmpty;
    if (ids.length) {
      const rows = await this.courses.findSlugsByIds(ids);
      const inProgram = rows.filter(
        (row) => row.program.toLowerCase() === query.program.toLowerCase(),
      );
      const found = new Set(inProgram.map((row) => row.id.toLowerCase()));
      for (const row of inProgram) resolved.add(row.slug);
      if (
        ids.some((id) => !found.has(id.toLowerCase())) &&
        resolved.size === 0
      ) {
        forceEmpty = true;
      }
    }
    return {
      program: query.program,
      q: query.q,
      paymentStatuses: query.paymentStatuses,
      trackSlugs: [...resolved],
      forceEmpty,
      isMinor: query.isMinor,
      dateOfBirth: query.dateOfBirth,
      dobFrom: query.dobFrom,
      dobTo: query.dobTo,
      ageMin: query.ageMin,
      ageMax: query.ageMax,
      from: query.from,
      to: query.to,
      paidFrom: query.paidFrom,
      paidTo: query.paidTo,
    };
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
      program: row.program || CORE_30_PROGRAM,
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
      program: row.program || CORE_30_PROGRAM,
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
      emailStatus: row.confirmationEmailStatus ?? null,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,
      emailError: row.confirmationEmailError ?? null,
      termsVersion: row.termsVersion ?? null,
      privacyVersion: row.privacyVersion ?? null,
      consentAt: row.consentAt?.toISOString?.() ?? row.consentAt ?? null,
      marketingOptIn: row.marketingOptIn ?? false,
      consentIp: maskPii ? null : (row.consentIp ?? null),
      consentUserAgent: maskPii ? null : (row.consentUserAgent ?? null),
      ageConfirmed: row.ageConfirmed ?? null,
      dateOfBirth: maskPii ? null : dateOnly(row.dateOfBirth),
      age: maskPii ? null : completedAge(dateOnly(row.dateOfBirth)),
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
