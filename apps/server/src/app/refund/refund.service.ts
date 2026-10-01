import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogType } from '@app/shared';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import type { CreateRefundDto, DecideRefundDto } from './dto/refund.dto';
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

  async list() {
    const rows = await this.refunds.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toDto(row));
  }

  async request(dto: CreateRefundDto, actorId?: string) {
    const enrollment = await this.enrollments.findOne({
      where: { id: dto.enrollmentId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.paymentStatus !== 'success') {
      throw new BadRequestException('Only paid enrollments can be refunded');
    }
    const row = await this.refunds.save(
      this.refunds.create({
        enrollmentId: enrollment.id,
        amount: enrollment.paidAmount ?? enrollment.amount,
        currency: enrollment.paidCurrency ?? enrollment.currency,
        status: 'pending',
        reason: dto.reason?.trim() || null,
        requestedBy: actorId ?? null,
      }),
    );
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_REQUESTED',
      userId: actorId,
      resourceType: 'refund_request',
      resourceId: row.id,
      metadata: { enrollmentId: enrollment.id, amount: row.amount },
    });
    return this.toDto(row);
  }

  async approve(id: string, dto: DecideRefundDto, actorId?: string) {
    const row = await this.find(id);
    if (row.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be approved');
    }
    row.status = 'approved';
    row.decisionNote = dto.note?.trim() || null;
    row.decidedBy = actorId ?? null;
    await this.refunds.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_APPROVED',
      userId: actorId,
      resourceType: 'refund_request',
      resourceId: row.id,
    });
    return this.toDto(row);
  }

  async reject(id: string, dto: DecideRefundDto, actorId?: string) {
    const row = await this.find(id);
    if (row.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }
    row.status = 'rejected';
    row.decisionNote = dto.note?.trim() || null;
    row.decidedBy = actorId ?? null;
    await this.refunds.save(row);
    this.audit.log({
      type: AuditLogType.MUTATION,
      action: 'REFUND_REJECTED',
      userId: actorId,
      resourceType: 'refund_request',
      resourceId: row.id,
    });
    return this.toDto(row);
  }

  async process(id: string, actorId?: string) {
    const row = await this.find(id);
    if (row.status !== 'approved') {
      throw new BadRequestException('Approve the refund before processing it');
    }
    const enrollment = await this.enrollments.findOne({
      where: { id: row.enrollmentId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const transaction =
      enrollment.paystackTransactionId || enrollment.paystackReference;
    if (!transaction) {
      throw new BadRequestException('Enrollment has no Paystack transaction');
    }
    try {
      const result = await this.paystack.refund(transaction);
      row.paystackRefundId = result.id;
      row.status = 'processed';
      enrollment.paymentStatus = 'refunded';
      await this.enrollments.save(enrollment);
      await this.refunds.save(row);
    } catch (error) {
      row.status = 'failed';
      row.decisionNote = error instanceof Error ? error.message : String(error);
      await this.refunds.save(row);
      this.audit.log({
        type: AuditLogType.PAYMENT,
        action: 'REFUND_FAILED',
        userId: actorId,
        resourceType: 'refund_request',
        resourceId: row.id,
        reason: row.decisionNote,
      });
      throw new BadRequestException(row.decisionNote);
    }
    this.audit.log({
      type: AuditLogType.PAYMENT,
      action: 'REFUND_PROCESSED',
      userId: actorId,
      resourceType: 'refund_request',
      resourceId: row.id,
      metadata: { paystackRefundId: row.paystackRefundId },
    });
    return this.toDto(row);
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
      status: row.status,
      reason: row.reason ?? null,
      decisionNote: row.decisionNote ?? null,
      requestedBy: row.requestedBy ?? null,
      decidedBy: row.decidedBy ?? null,
      paystackRefundId: row.paystackRefundId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
