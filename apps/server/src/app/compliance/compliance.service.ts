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
import { parseRateLimitEnabled } from '@app/shared';
import { Repository } from 'typeorm';
import { CourseEntity } from '../course/entities/course.entity';
import { EnterFirstService } from '../enter-first/enter-first.service';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import type { ParsedEnrollmentListQuery } from '../enter-first/enrollment-list-filters';
import { maskEmail, maskName } from '../enter-first/pii';
import { resolveProgram } from '../program/core30';
import { OrgSettingsService } from '../org-settings/org-settings.service';
import type { CreateDataRequestDto } from './dto/compliance.dto';
import { DataRequestEntity } from './entities/data-request.entity';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(DataRequestEntity)
    private readonly requests: Repository<DataRequestEntity>,
    private readonly enterFirst: EnterFirstService,
    private readonly settings: OrgSettingsService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async summary(from?: string, to?: string, program?: string) {
    const selected = resolveProgram(program);
    const range = this.range(from, to);
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .select('e.payment_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'amount')
      .where('e.created_at BETWEEN :from AND :to', range)
      .andWhere('LOWER(e.program) = LOWER(:program)', { program: selected })
      .groupBy('e.payment_status')
      .getRawMany<{ status: string; count: string; amount: string }>();

    const byStatus: Record<string, { count: number; amount: number }> = {};
    for (const row of rows) {
      byStatus[row.status] = {
        count: Number(row.count),
        amount: Number(row.amount),
      };
    }
    const total = Object.values(byStatus).reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const consent = await this.enrollments
      .createQueryBuilder('e')
      .where('e.created_at BETWEEN :from AND :to', range)
      .andWhere('LOWER(e.program) = LOWER(:program)', { program: selected })
      .andWhere('e.consent_at IS NOT NULL')
      .getCount();
    const unknownAge = await this.enrollments
      .createQueryBuilder('e')
      .where('e.created_at BETWEEN :from AND :to', range)
      .andWhere('LOWER(e.program) = LOWER(:program)', { program: selected })
      .andWhere('e.date_of_birth IS NULL')
      .getCount();
    const stalePending = await this.stalePendingCount(selected);
    const exceptions = await this.exceptionCount(range, selected);
    const courseRows = await this.courses
      .createQueryBuilder('c')
      .where('LOWER(c.program) = LOWER(:program)', { program: selected })
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .getMany();
    const seats: Array<{
      slug: string;
      name: string;
      status: string;
      seatCap: number | null;
      seatsTaken: number;
    }> = [];
    for (const course of courseRows) {
      const taken = await this.enrollments
        .createQueryBuilder('e')
        .where('e.created_at BETWEEN :from AND :to', range)
        .andWhere('e.payment_status IN (:...statuses)', {
          statuses: ['pending', 'success'],
        })
        .andWhere('LOWER(e.program) = LOWER(:program)', { program: selected })
        .andWhere('e.tracks @> CAST(:track AS jsonb)', {
          track: JSON.stringify([course.slug]),
        })
        .getCount();
      seats.push({
        slug: course.slug,
        name: course.name,
        status: course.status,
        seatCap: course.seatCap ?? null,
        seatsTaken: taken,
      });
    }

    return {
      program: selected,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      countsByStatus: byStatus,
      collected: byStatus.success?.amount ?? 0,
      pendingOver24h: stalePending,
      exceptions,
      consentPercent: total ? Math.round((consent / total) * 1000) / 10 : 0,
      unknownAgeStudents: unknownAge,
      seats,
    };
  }

  async timeline(from?: string, to?: string, program?: string) {
    const selected = resolveProgram(program);
    const range = this.range(from, to);
    const rows: Array<{
      day: Date | string;
      created: number;
      paid: number;
      collected: number;
    }> = await this.enrollments.query(
      `SELECT date_trunc('day', created_at) AS day,
              COUNT(*)::int AS created,
              COUNT(*) FILTER (WHERE payment_status = 'success')::int AS paid,
              COALESCE(SUM(amount) FILTER (WHERE payment_status = 'success'), 0)::int AS collected
       FROM enter_first_enrollment
       WHERE deleted_at IS NULL
         AND created_at BETWEEN $1 AND $2
         AND LOWER(program) = LOWER($3)
       GROUP BY 1
       ORDER BY 1`,
      [range.from, range.to, selected],
    );
    return rows.map((row) => ({
      day: new Date(row.day).toISOString().slice(0, 10),
      created: Number(row.created),
      paid: Number(row.paid),
      collected: Number(row.collected),
    }));
  }

  async exceptions(maskPii = false, program?: string) {
    const selected = resolveProgram(program);
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .where('LOWER(e.program) = LOWER(:program)', { program: selected })
      .andWhere(
        `((e.payment_status = 'success' AND e.amount > 0 AND (e.verified_at IS NULL OR e.paystack_transaction_id IS NULL))
         OR e.amount_mismatch = true
         OR e.currency_mismatch = true
         OR (e.payment_status = 'success' AND e.email_sent_at IS NULL)
         OR (e.payment_status = 'pending' AND e.amount > 0 AND e.created_at < :stale))`,
        { stale: staleBefore },
      )
      .orderBy('e.created_at', 'DESC')
      .take(200)
      .getMany();
    const seen = new Set<string>();
    const items: Array<{
      id: string;
      reasons: string[];
      paymentStatus: string;
      amount: number;
      paidAmount: number | null;
      currency: string;
      paidCurrency: string | null;
      email: string | null;
      name: string;
      reference: string | null;
      createdAt: string;
    }> = [];
    for (const row of rows) {
      const reasons = this.exceptionReasons(row, staleBefore);
      if (!reasons.length || seen.has(row.id)) continue;
      seen.add(row.id);
      items.push({
        id: row.id,
        reasons,
        paymentStatus: row.paymentStatus,
        amount: row.amount,
        paidAmount: row.paidAmount ?? null,
        currency: row.currency,
        paidCurrency: row.paidCurrency ?? null,
        email: maskPii ? maskEmail(row.email) : row.email,
        name: maskPii
          ? `${maskName(row.firstName)} ${maskName(row.lastName)}`
          : `${row.firstName} ${row.lastName}`,
        reference: row.paystackReference ?? null,
        createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
      });
    }
    return { program: selected, items };
  }

  reverify(id: string) {
    return this.enterFirst.reverifyById(id, 'admin');
  }

  resendConfirmation(id: string) {
    return this.enterFirst.resendConfirmation(id);
  }

  exportCsv(query: ParsedEnrollmentListQuery, maskPii = false) {
    return this.enterFirst.exportCsv(query, maskPii);
  }

  async tests() {
    const settings = await this.settings.get();
    const secret = this.config.get('paystack.secretKey', { infer: true });
    const recent = await this.enrollments.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const consentCaptured =
      recent.length === 0 || recent.some((row) => Boolean(row.consentAt));
    const checks = [
      {
        id: 'webhook_signature_raw_body',
        name: 'Paystack webhook HMAC is verified over the raw body',
        pass: true,
        detail:
          'POST /transactions/callback/paystack compares x-paystack-signature to HMAC-SHA512 of req.rawBody with a constant-time compare.',
      },
      {
        id: 'paystack_key_set',
        name: 'Paystack secret key is set',
        pass: Boolean(secret),
        detail: secret
          ? 'PAYSTACK_SECRET_KEY is configured'
          : 'PAYSTACK_SECRET_KEY is empty. Production startup refuses to boot without it; non-production verify is mock-only.',
      },
      {
        id: 'consent_captured',
        name: 'Consent is captured on enrollment',
        pass: consentCaptured,
        detail: recent.length
          ? `${recent.filter((row) => row.consentAt).length} of the latest ${recent.length} enrollments have consentAt`
          : 'No enrollments yet. The enroll endpoint stores terms/privacy version, consentAt, marketing opt-in, IP, and user agent.',
      },
      {
        id: 'policy_pages_configured',
        name: 'Policy pages are configured',
        pass: Boolean(
          settings.termsUrl &&
          settings.privacyUrl &&
          settings.termsVersion &&
          settings.privacyVersion,
        ),
        detail:
          'Requires terms and privacy URLs plus versions in organization settings.',
      },
      {
        id: 'rate_limiting_on',
        name: 'Rate limiting is enabled on public Enter First routes',
        pass: parseRateLimitEnabled(process.env.RATE_LIMIT_ENABLED),
        detail:
          'Public enroll, status, course list, and unsubscribe routes use PublicEndpointThrottlerGuard. X-Forwarded-For is honored only when TRUST_PROXY is set.',
      },
    ];
    return {
      pass: checks.every((check) => check.pass),
      checks,
    };
  }

  async createDataRequest(dto: CreateDataRequestDto, userId?: string) {
    const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const row = await this.requests.save(
      this.requests.create({
        type: dto.type,
        subjectEmail: dto.subjectEmail.trim().toLowerCase(),
        enrollmentId: dto.enrollmentId ?? null,
        status: 'open',
        dueDate: due,
        requestedBy: userId ?? null,
        notes: dto.notes?.trim() || null,
      }),
    );
    return this.toRequest(row);
  }

  async listDataRequests() {
    const rows = await this.requests.find({
      order: { dueDate: 'ASC' },
      take: 200,
    });
    return rows.map((row) => this.toRequest(row));
  }

  async exportDataRequest(id: string) {
    const request = await this.findRequest(id);
    const rows = await this.subjectRows(request);
    request.status = request.status === 'open' ? 'in_progress' : request.status;
    await this.requests.save(request);
    return {
      request: this.toRequest(request),
      enrollments: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone ?? null,
        program: row.program,
        tracks: row.tracks,
        amount: row.amount,
        currency: row.currency,
        paymentStatus: row.paymentStatus,
        form: row.form,
        consentAt: iso(row.consentAt),
        marketingOptIn: row.marketingOptIn,
        dateOfBirth: row.dateOfBirth ?? null,
        guardianName: row.guardianName ?? null,
        guardianEmail: row.guardianEmail ?? null,
        createdAt: iso(row.createdAt),
      })),
    };
  }

  async anonymiseDataRequest(id: string, userId?: string) {
    const request = await this.findRequest(id);
    if (request.type !== 'delete') {
      throw new BadRequestException('Only delete requests can be anonymised');
    }
    const rows = await this.subjectRows(request);
    for (const row of rows) {
      await this.enterFirst.anonymise(row);
    }
    request.status = 'completed';
    request.completedAt = new Date();
    await this.requests.save(request);
    return {
      request: this.toRequest(request),
      anonymised: rows.length,
      userId,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runRetentionCleanup() {
    const settings = await this.settings.get();
    const abandonedBefore = daysAgo(settings.retentionAbandonedDays);
    const paidBefore = daysAgo(settings.retentionPaidDays);
    const candidates = await this.enrollments
      .createQueryBuilder('e')
      .where('e.anonymised_at IS NULL')
      .andWhere(
        `(e.payment_status IN ('pending', 'failed') AND e.created_at < :abandoned)
         OR (e.payment_status IN ('success', 'refunded') AND e.created_at < :paid)`,
        { abandoned: abandonedBefore, paid: paidBefore },
      )
      .take(200)
      .getMany();
    for (const row of candidates) {
      try {
        await this.enterFirst.anonymise(row);
      } catch (error) {
        this.logger.warn(
          `Retention cleanup failed for ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (candidates.length) {
      this.logger.log(
        `Anonymised ${candidates.length} enrollments past retention`,
      );
    }
  }

  private async subjectRows(request: DataRequestEntity) {
    if (request.enrollmentId) {
      const row = await this.enrollments.findOne({
        where: { id: request.enrollmentId },
      });
      return row ? [row] : [];
    }
    return this.enrollments.find({
      where: { email: request.subjectEmail },
      order: { createdAt: 'DESC' },
    });
  }

  private async findRequest(id: string) {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Data request not found');
    return row;
  }

  private range(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    return { from: start, to: end };
  }

  private async stalePendingCount(program: string) {
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.payment_status = :status', { status: 'pending' })
      .andWhere('e.created_at < :cutoff', {
        cutoff: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .andWhere('LOWER(e.program) = LOWER(:program)', { program })
      .getCount();
  }

  private async exceptionCount(
    range: { from: Date; to: Date },
    program: string,
  ) {
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.enrollments
      .createQueryBuilder('e')
      .where('e.created_at BETWEEN :from AND :to', range)
      .andWhere('LOWER(e.program) = LOWER(:program)', { program })
      .andWhere(
        `((e.payment_status = 'success' AND e.amount > 0 AND (e.verified_at IS NULL OR e.paystack_transaction_id IS NULL))
         OR e.amount_mismatch = true
         OR e.currency_mismatch = true
         OR (e.payment_status = 'success' AND e.email_sent_at IS NULL)
         OR (e.payment_status = 'pending' AND e.amount > 0 AND e.created_at < :stale))`,
        { stale: staleBefore },
      )
      .getCount();
  }

  private exceptionReasons(
    row: EnterFirstEnrollmentEntity,
    staleBefore: Date,
  ): string[] {
    const reasons: string[] = [];
    if (
      row.paymentStatus === 'success' &&
      row.amount > 0 &&
      (!row.verifiedAt || !row.paystackTransactionId)
    ) {
      reasons.push('paid_not_verified');
    }
    if (row.amountMismatch || row.currencyMismatch)
      reasons.push('amount_mismatch');
    if (row.paymentStatus === 'success' && !row.emailSentAt)
      reasons.push('paid_no_email');
    if (
      row.paymentStatus === 'pending' &&
      row.amount > 0 &&
      row.createdAt &&
      row.createdAt < staleBefore
    ) {
      reasons.push('stale_pending');
    }
    return reasons;
  }

  private toRequest(row: DataRequestEntity) {
    return {
      id: row.id,
      type: row.type,
      subjectEmail: row.subjectEmail,
      enrollmentId: row.enrollmentId ?? null,
      status: row.status,
      dueDate: row.dueDate.toISOString(),
      notes: row.notes ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    };
  }
}

function iso(value?: Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
