import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType, type EnvTypes } from '@app/shared';
import { LessThan, Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditLogEntity } from '../audit-log/entities/audit-log.entity';
import { CoreSettingsService } from '../core-settings/core-settings.service';
import { CourseService } from '../course/course.service';
import { EmailMessageEntity } from '../email/entities/email.entities';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { EnterFirstService } from '../enter-first/enter-first.service';
import { OpsHeartbeatService } from '../ops/ops-heartbeat.service';
import { PAYSTACK_WEBHOOK_USES_RAW_BODY } from '../payment-gateway/paystack/paystack-signature';
import { evaluateComplianceChecks } from './compliance.checks';
import type { CreateDataRequestDto } from './dto/data-request.dto';
import { DataRequestEntity } from './entities/data-request.entity';

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    @InjectRepository(DataRequestEntity)
    private readonly requests: Repository<DataRequestEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly audits: Repository<AuditLogEntity>,
    @InjectRepository(EmailMessageEntity)
    private readonly messages: Repository<EmailMessageEntity>,
    private readonly courses: CourseService,
    private readonly enterFirst: EnterFirstService,
    private readonly settings: CoreSettingsService,
    private readonly heartbeat: OpsHeartbeatService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async summary(from?: string, to?: string) {
    const rows = await this.scoped(from, to);
    const counts = { pending: 0, success: 0, failed: 0, refunded: 0 };
    let collected = 0;
    let pendingOver24h = 0;
    let exceptions = 0;
    let withConsent = 0;
    let unknownAge = 0;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    for (const row of rows) {
      counts[row.paymentStatus] += 1;
      if (row.paymentStatus === 'success')
        collected += row.paidAmount ?? row.amount;
      if (
        row.paymentStatus === 'pending' &&
        row.createdAt.getTime() < dayAgo &&
        row.amount > 0
      ) {
        pendingOver24h += 1;
      }
      if (this.exceptionKind(row)) exceptions += 1;
      if (row.consentAt) withConsent += 1;
      if (!row.dateOfBirth) unknownAge += 1;
    }
    const seats = await this.courses.listAdmin();
    return {
      countsByStatus: counts,
      collected,
      pendingOver24h,
      exceptions,
      consentPercent: rows.length
        ? Math.round((withConsent / rows.length) * 1000) / 10
        : 100,
      unknownAge,
      seats: seats.map((course) => ({
        courseId: course.id,
        slug: course.slug,
        name: course.name,
        seatCap: course.seatCap,
        taken: course.seatsTaken,
        remaining: course.seatsRemaining,
      })),
    };
  }

  async timeline(from?: string, to?: string) {
    const rows = await this.scoped(from, to);
    const days = new Map<
      string,
      { date: string; enrollments: number; collected: number }
    >();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const bucket = days.get(date) ?? { date, enrollments: 0, collected: 0 };
      bucket.enrollments += 1;
      if (row.paymentStatus === 'success') {
        bucket.collected += row.paidAmount ?? row.amount;
      }
      days.set(date, bucket);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async exceptions() {
    const rows = await this.enrollments.find({
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return rows
      .map((row) => ({ row, kind: this.exceptionKind(row) }))
      .filter((item) => item.kind)
      .map((item) => ({
        id: item.row.id,
        kind: item.kind,
        email: item.row.email,
        amount: item.row.amount,
        paidAmount: item.row.paidAmount ?? null,
        currency: item.row.currency,
        paymentStatus: item.row.paymentStatus,
        reference: item.row.paystackReference ?? null,
        createdAt: item.row.createdAt,
      }));
  }

  async exportCsv(from?: string, to?: string) {
    const rows = await this.scoped(from, to);
    const header = [
      'id',
      'createdAt',
      'firstName',
      'lastName',
      'email',
      'tracks',
      'amount',
      'currency',
      'paymentStatus',
      'reference',
      'paidAt',
      'consentAt',
      'marketingOptIn',
      'exception',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.createdAt.toISOString(),
          row.firstName,
          row.lastName,
          row.email,
          (row.tracks ?? []).join('|'),
          row.amount,
          row.currency,
          row.paymentStatus,
          row.paystackReference ?? '',
          row.paidAt?.toISOString() ?? '',
          row.consentAt?.toISOString() ?? '',
          row.marketingOptIn ? 'yes' : 'no',
          this.exceptionKind(row) ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  async tests(from?: string, to?: string) {
    const rows = await this.scoped(from, to);
    const missingConsent = rows.filter((row) => !row.consentAt).length;
    const settings = await this.settings.get();
    const checks = evaluateComplianceChecks({
      paystackKeySet: !!this.config.get('paystack.secretKey', { infer: true }),
      webhookUsesRawBody: PAYSTACK_WEBHOOK_USES_RAW_BODY,
      missingConsent,
      termsUrl: settings.termsUrl,
      privacyUrl: settings.privacyUrl,
      rateLimitEnabled: true,
    });
    return {
      pass: checks.every((check) => check.pass),
      checks,
    };
  }

  async health() {
    const settings = await this.settings.get();
    const secret = this.config.get('paystack.secretKey', { infer: true });
    const paystack = await this.paystackHealth(secret);
    const lastReconciliation = this.heartbeat.get('reconciliation');
    const uptimeMs = Date.now() - this.heartbeat.startedAt.getTime();
    const reconciliationFresh =
      (!!lastReconciliation &&
        Date.now() - new Date(lastReconciliation).getTime() < 20 * 60 * 1000) ||
      uptimeMs < 20 * 60 * 1000;
    return {
      paystack,
      webhooks: {
        ok: PAYSTACK_WEBHOOK_USES_RAW_BODY,
        paystackLastAt: this.heartbeat.get('paystack_webhook'),
        resendLastAt: this.heartbeat.get('resend_webhook'),
      },
      resend: {
        ok: !!this.config.get('email.apiKey', { infer: true }),
        detail: this.config.get('email.apiKey', { infer: true })
          ? 'API key configured'
          : 'RESEND_API_KEY is empty',
      },
      reconciliation: {
        ok: reconciliationFresh,
        lastRunAt: lastReconciliation,
      },
      policyPages: {
        ok: !!settings.termsUrl && !!settings.privacyUrl,
        termsUrl: settings.termsUrl,
        privacyUrl: settings.privacyUrl,
        termsVersion: settings.termsVersion,
        privacyVersion: settings.privacyVersion,
      },
    };
  }

  reverify(id: string, actorId?: string) {
    return this.enterFirst.reverify(id, actorId);
  }

  resendConfirmation(id: string, actorId?: string) {
    return this.enterFirst.resendConfirmation(id, actorId);
  }

  async listDataRequests() {
    const rows = await this.requests.find({ order: { dueAt: 'ASC' } });
    return rows.map((row) => this.requestDto(row));
  }

  async createDataRequest(dto: CreateDataRequestDto, actorId?: string) {
    const settings = await this.settings.get();
    const dueAt = new Date(Date.now() + settings.dataRequestDueDays * 86400000);
    const row = await this.requests.save(
      this.requests.create({
        type: dto.type,
        subjectEmail: dto.subjectEmail.trim().toLowerCase(),
        enrollmentId: dto.enrollmentId ?? null,
        status: 'open',
        dueAt,
        notes: dto.notes?.trim() || null,
        requestedBy: actorId ?? null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'DATA_REQUEST_CREATED',
      userId: actorId,
      resourceType: 'data_request',
      resourceId: row.id,
    });
    return this.requestDto(row);
  }

  async exportSubject(id: string, actorId?: string) {
    const request = await this.findRequest(id);
    const rows = await this.enrollments.find({
      where: { email: request.subjectEmail },
    });
    request.status = 'in_progress';
    await this.requests.save(request);
    this.audit.log({
      type: AuditLogType.ACCESS,
      action: 'DATA_EXPORTED',
      userId: actorId,
      resourceType: 'data_request',
      resourceId: id,
    });
    return {
      request: this.requestDto(request),
      enrollments: await Promise.all(
        rows.map((row) => this.enterFirst.getById(row.id, false)),
      ),
    };
  }

  async anonymiseSubject(id: string, actorId?: string) {
    const request = await this.findRequest(id);
    const rows = await this.enrollments.find({
      where: { email: request.subjectEmail },
    });
    for (const row of rows) await this.enterFirst.anonymise(row);
    request.status = 'completed';
    request.completedAt = new Date();
    await this.requests.save(request);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'DATA_ANONYMISED',
      userId: actorId,
      resourceType: 'data_request',
      resourceId: id,
      metadata: { count: rows.length },
    });
    return this.requestDto(request);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runRetention() {
    const settings = await this.settings.get();
    const enrollmentCutoff = new Date(
      Date.now() - settings.retentionEnrollmentDays * 86400000,
    );
    const oldEnrollments = await this.enrollments.find({
      where: { createdAt: LessThan(enrollmentCutoff) },
      take: 200,
    });
    for (const row of oldEnrollments) {
      if (row.email.endsWith('@redacted.invalid')) continue;
      await this.enterFirst.anonymise(row);
    }
    const auditCutoff = new Date(
      Date.now() - settings.retentionAuditDays * 86400000,
    );
    await this.audits
      .createQueryBuilder()
      .delete()
      .from(AuditLogEntity)
      .where('created_at < :cutoff', { cutoff: auditCutoff })
      .execute();
    const emailCutoff = new Date(
      Date.now() - settings.retentionEmailDays * 86400000,
    );
    await this.messages
      .createQueryBuilder()
      .delete()
      .from(EmailMessageEntity)
      .where('created_at < :cutoff', { cutoff: emailCutoff })
      .execute();
    this.heartbeat.beat('retention');
  }

  private async scoped(from?: string, to?: string) {
    const qb = this.enrollments
      .createQueryBuilder('e')
      .orderBy('e.createdAt', 'DESC');
    if (from) qb.andWhere('e.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('e.createdAt <= :to', { to: new Date(to) });
    return qb.getMany();
  }

  private exceptionKind(row: EnterFirstEnrollmentEntity): string | null {
    if (row.reconciliationException === 'amount_mismatch')
      return 'amount_mismatch';
    if (row.paymentStatus === 'success' && row.amount > 0 && !row.verifiedAt) {
      return 'paid_not_verified';
    }
    if (row.paymentStatus === 'success' && !row.emailSentAt)
      return 'paid_no_email';
    if (
      row.paymentStatus === 'pending' &&
      row.amount > 0 &&
      row.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000
    ) {
      return 'stale_pending';
    }
    return null;
  }

  private async paystackHealth(secret: string) {
    if (!secret) return { ok: false, detail: 'PAYSTACK_SECRET_KEY is empty' };
    try {
      const response = await fetch('https://api.paystack.co/balance', {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(2500),
      });
      return {
        ok: response.ok,
        detail: response.ok
          ? 'Paystack reachable'
          : `Paystack HTTP ${response.status}`,
      };
    } catch {
      return { ok: false, detail: 'Paystack balance check failed' };
    }
  }

  private async findRequest(id: string) {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Data request not found');
    return row;
  }

  private requestDto(row: DataRequestEntity) {
    return {
      id: row.id,
      type: row.type,
      subjectEmail: row.subjectEmail,
      enrollmentId: row.enrollmentId ?? null,
      status: row.status,
      dueAt: row.dueAt,
      notes: row.notes ?? null,
      completedAt: row.completedAt ?? null,
      createdAt: row.createdAt,
    };
  }
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
