import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogType } from '@app/shared';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import type { CreateRefundDto, ReviewRefundDto } from './dto/refund.dto';
import { RefundRequestEntity } from './entities/refund-request.entity';

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(RefundRequestEntity)
    private readonly refunds: Repository<RefundRequestEntity>,
    @InjectRepository(EnterFirstEnrollmentEntity)
    private readonly enrollments: Repository<EnterFirstEnrollmentEntity>,
    private readonly paystack: PaystackProvider,
    private readonly audit: AuditLogService,
  ) {}

  async create(dto: CreateRefundDto, userId?: string) {
    const enrollment = await this.requirePaid(dto.enrollmentId);
    const open = await this.refunds.findOne({
      where: {
        enrollmentId: enrollment.id,
        status: In(['requested', 'approved', 'processed']),
      },
    });
    if (open)
      throw new BadRequestException(
        'A refund is already open for this enrollment',
      );
    const amount = dto.amount ?? enrollment.amount;
    if (amount > enrollment.amount) {
      throw new BadRequestException('Refund amount exceeds the amount charged');
    }
    const row = await this.refunds.save(
      this.refunds.create({
        enrollmentId: enrollment.id,
        amount,
        currency: enrollment.currency,
        reason: dto.reason.trim(),
        status: 'requested',
        requestedBy: userId ?? null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_REQUESTED',
      userId,
      resourceType: 'refund',
      resourceId: row.id,
      metadata: { enrollmentId: enrollment.id, amount },
    });
    return this.toDto(row);
  }

  async list() {
    const rows = await this.refunds.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(id: string) {
    return this.toDto(await this.find(id));
  }

  async approve(id: string, dto: ReviewRefundDto, userId?: string) {
    const row = await this.find(id);
    if (row.status !== 'requested') {
      throw new BadRequestException('Only requested refunds can be approved');
    }
    row.status = 'approved';
    row.reviewedBy = userId ?? null;
    row.reviewNote = dto.note?.trim() || null;
    await this.refunds.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_APPROVED',
      userId,
      resourceType: 'refund',
      resourceId: row.id,
    });
    return this.toDto(row);
  }

  async reject(id: string, dto: ReviewRefundDto, userId?: string) {
    const row = await this.find(id);
    if (row.status !== 'requested' && row.status !== 'approved') {
      throw new BadRequestException('This refund can no longer be rejected');
    }
    row.status = 'rejected';
    row.reviewedBy = userId ?? null;
    row.reviewNote = dto.note?.trim() || null;
    await this.refunds.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_REJECTED',
      userId,
      resourceType: 'refund',
      resourceId: row.id,
    });
    return this.toDto(row);
  }

  async process(id: string, userId?: string) {
    const row = await this.find(id);
    if (row.status !== 'approved') {
      throw new BadRequestException('Approve the refund before processing it');
    }
    const enrollment = await this.requirePaid(row.enrollmentId);
    try {
      const result = await this.paystack.refund({
        transactionId: enrollment.paystackTransactionId ?? undefined,
        reference: enrollment.paystackReference,
        amountNaira: row.amount,
      });
      row.paystackRefundId = result.id;
      row.status = 'processed';
      row.processedAt = new Date();
      row.failureReason = null;
      enrollment.paymentStatus = 'refunded';
      await this.enrollments.save(enrollment);
      await this.refunds.save(row);
    } catch (error) {
      row.status = 'failed';
      row.failureReason =
        error instanceof Error ? error.message : String(error);
      await this.refunds.save(row);
      this.audit.log({
        type: AuditLogType.PAYMENT,
        action: 'REFUND_FAILED',
        userId,
        resourceType: 'refund',
        resourceId: row.id,
        metadata: { error: row.failureReason },
      });
      throw new BadRequestException(row.failureReason);
    }
    this.audit.log({
      type: AuditLogType.PAYMENT,
      action: 'REFUND_PROCESSED',
      userId,
      resourceType: 'refund',
      resourceId: row.id,
      metadata: { paystackRefundId: row.paystackRefundId },
    });
    return this.toDto(row);
  }

  private async requirePaid(id: string) {
    const enrollment = await this.enrollments.findOne({ where: { id } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (
      enrollment.paymentStatus !== 'success' &&
      enrollment.paymentStatus !== 'refunded'
    ) {
      throw new BadRequestException('Only paid enrollments can be refunded');
    }
    if (enrollment.paymentStatus === 'refunded') {
      throw new BadRequestException('Enrollment is already refunded');
    }
    return enrollment;
  }

  private async find(id: string) {
    const row = await this.refunds.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Refund request not found');
    return row;
  }

  private toDto(row: RefundRequestEntity) {
    return {
      id: row.id,
      enrollmentId: row.enrollmentId,
      amount: row.amount,
      currency: row.currency,
      reason: row.reason,
      status: row.status,
      requestedBy: row.requestedBy ?? null,
      reviewedBy: row.reviewedBy ?? null,
      reviewNote: row.reviewNote ?? null,
      paystackRefundId: row.paystackRefundId ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      failureReason: row.failureReason ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    };
  }
}
