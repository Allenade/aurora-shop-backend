import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogType, PaymentAuditAction } from '@app/shared';
import { randomInt } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EnterFirstService } from '../enter-first/enter-first.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentProviderRegistry } from '../payment-gateway/_contract/payment-provider.registry';
import {
  TransactionProvider,
  TransactionReason,
  TransactionStatus,
  type CallbackOutcome,
  type RegisterContext,
} from '../payment-gateway/_contract/payment.types';
import { evaluateCharge } from '../payment-gateway/paystack/charge-match';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import { OrderEntity } from '../order/entities/order.entity';
import { pollProviderPaymentStatus } from './poll-provider-payment-status';
import { TransactionEntity } from './entities/transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly rows: Repository<TransactionEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    private readonly registry: PaymentProviderRegistry,
    private readonly paystack: PaystackProvider,
    private readonly audit: AuditLogService,
    private readonly inventory: InventoryService,
    @Inject(forwardRef(() => EnterFirstService))
    private readonly enterFirst: EnterFirstService,
  ) {}

  nextReference() {
    return `TXN-${Date.now()}-${randomInt(100, 999)}`;
  }

  async create(input: {
    amount: number;
    provider: TransactionProvider;
    userId: string;
    orderId?: string;
    register: RegisterContext;
  }) {
    const reference = input.register.reference || this.nextReference();
    const row = await this.rows.save(
      this.rows.create({
        reference,
        amount: input.amount,
        provider: input.provider,
        status: TransactionStatus.PENDING,
        reason: TransactionReason.ORDER,
        userId: input.userId,
        orderId: input.orderId,
      }),
    );

    const registered = await this.registry.get(input.provider).register({
      ...input.register,
      reference,
    });
    row.externalReference = registered.externalReference ?? reference;
    row.authorizationUrl =
      registered.authorizationUrl ?? registered.redirectUrl;
    row.metadata = registered;
    await this.rows.save(row);

    this.audit.log({
      type: AuditLogType.PAYMENT,
      action: PaymentAuditAction.CREATED,
      userId: input.userId,
      resourceType: 'transaction',
      resourceId: row.id,
    });

    return { ...row, ...registered };
  }

  async findByReference(reference: string) {
    const row = await this.rows.findOne({
      where: [{ reference }, { externalReference: reference }],
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  async handleCallback(
    provider: TransactionProvider,
    headers?: Record<string, string>,
    rawBody?: Buffer,
  ) {
    if (provider !== TransactionProvider.PAYSTACK) {
      throw new BadRequestException(
        'Only Paystack webhooks are accepted. Collect bank transfers with Paystack Pay with Transfer.',
      );
    }
    const signature = headers?.['x-paystack-signature'];
    if (!rawBody || !this.paystack.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }
    const outcome = this.paystack.parseVerifiedPayload(rawBody);
    outcome.confirmedVia = 'webhook';
    const reference = outcome.externalReference;
    if (!reference) return { message: 'Callback processed' };
    const row = await this.rows.findOne({
      where: [{ reference }, { externalReference: reference }],
    });
    if (!row) {
      // Enter First enrollments share this Paystack webhook (`EF-…` refs).
      const enterFirst = await this.enterFirst.handleProviderCallback(outcome);
      if (enterFirst.handled) {
        return { message: 'Callback processed', enterFirst };
      }
      return { message: 'Callback processed' };
    }
    if (row.status === TransactionStatus.SUCCESS) {
      return { message: 'Callback processed' };
    }
    if (outcome.status === TransactionStatus.PENDING) {
      // Untrusted or not-yet-final callback — nothing to record.
      return { message: 'Callback processed' };
    }
    await this.applyOutcome(row, outcome);
    return { message: 'Callback processed', transaction: row };
  }

  /** Ask the provider whether a pending reference has been paid yet. */
  async verifyForUser(reference: string, userId: string, isAdmin: boolean) {
    const row = await this.findByReference(reference);
    if (!isAdmin && row.userId && row.userId !== userId) {
      throw new ForbiddenException('Transaction not yours');
    }
    if (row.status !== TransactionStatus.PENDING) return this.toStatusDto(row);

    const ref = row.externalReference ?? row.reference;
    if (row.metadata?.reconciliationException === 'amount_mismatch') {
      return this.toStatusDto(row);
    }
    const outcome = await pollProviderPaymentStatus(row.provider, ref, {
      paystack: this.paystack,
    });
    outcome.confirmedVia = 'poll';
    if (outcome.status === TransactionStatus.PENDING) {
      return this.toStatusDto(row);
    }
    await this.applyOutcome(row, outcome);
    return this.toStatusDto(row);
  }

  private async applyOutcome(row: TransactionEntity, outcome: CallbackOutcome) {
    if (
      outcome.status === TransactionStatus.SUCCESS &&
      evaluateCharge(
        { amount: row.amount, currency: 'NGN' },
        {
          amount: outcome.amount,
          currency: outcome.currency,
          mock: outcome.metadata?.mode === 'mock',
        },
      ) !== 'match'
    ) {
      row.metadata = {
        ...(row.metadata ?? {}),
        reconciliationException: 'amount_mismatch',
        paidAmount: outcome.amount ?? null,
        paidCurrency: outcome.currency ?? null,
        paystackTransactionId: outcome.paystackTransactionId ?? null,
        channel: outcome.channel ?? null,
        confirmedVia: outcome.confirmedVia ?? null,
      };
      await this.rows.save(row);
      this.audit.log({
        type: AuditLogType.PAYMENT,
        action: PaymentAuditAction.FAILED,
        resourceType: 'transaction',
        resourceId: row.id,
        userId: row.userId,
        reason: 'amount_mismatch',
      });
      return;
    }

    row.status = outcome.status;
    row.metadata = {
      ...(row.metadata ?? {}),
      paystackTransactionId: outcome.paystackTransactionId ?? null,
      paidAmount: outcome.amount ?? null,
      paidCurrency: outcome.currency ?? null,
      channel: outcome.channel ?? null,
      verifiedAt: new Date().toISOString(),
      confirmedVia: outcome.confirmedVia ?? null,
      reconciliationException: null,
    };
    await this.rows.save(row);
    if (outcome.status === TransactionStatus.SUCCESS) {
      await this.markOrderPaid(row);
    }
    this.audit.log({
      type: AuditLogType.PAYMENT,
      action:
        outcome.status === TransactionStatus.SUCCESS
          ? PaymentAuditAction.SUCCESS
          : PaymentAuditAction.FAILED,
      resourceType: 'transaction',
      resourceId: row.id,
      userId: row.userId,
    });
  }

  private async toStatusDto(row: TransactionEntity) {
    const order = await this.orders.findOne({
      where: row.orderId ? { id: row.orderId } : { orderNumber: row.reference },
    });
    return {
      reference: row.reference,
      provider: row.provider,
      status: row.status,
      paid: row.status === TransactionStatus.SUCCESS,
      amount: row.amount,
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      trackingNumber: order?.trackingNumber,
      paymentStatus: order?.paymentStatus,
    };
  }

  private async markOrderPaid(row: TransactionEntity) {
    const order = await this.orders.findOne({
      where: row.orderId ? { id: row.orderId } : { orderNumber: row.reference },
    });
    if (!order || order.paymentStatus === 'paid') return;
    order.paymentStatus = 'paid';
    order.timeline = (order.timeline ?? []).map((step) =>
      step.id === 'payment'
        ? { ...step, status: 'done', at: new Date().toISOString() }
        : step,
    );
    await this.orders.save(order);
    for (const item of order.items ?? []) {
      await this.inventory.commitReserved(item.productId, item.qty);
    }
  }
}
