import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLogType,
  PaymentAuditAction,
} from '@app/shared';
import { randomInt } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentProviderRegistry } from '../payment-gateway/_contract/payment-provider.registry';
import {
  TransactionProvider,
  TransactionReason,
  TransactionStatus,
  type RegisterContext,
} from '../payment-gateway/_contract/payment.types';
import { OrderEntity } from '../order/entities/order.entity';
import { TransactionEntity } from './entities/transaction.entity';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly rows: Repository<TransactionEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    private readonly registry: PaymentProviderRegistry,
    private readonly audit: AuditLogService,
    private readonly inventory: InventoryService,
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
    row.authorizationUrl = registered.authorizationUrl ?? registered.redirectUrl;
    row.metadata = registered as unknown as Record<string, unknown>;
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
    payload: unknown,
    headers?: Record<string, string>,
  ) {
    const adapter = this.registry.get(provider);
    const reference = adapter.extractCallbackReference(payload, headers);
    if (!reference) return { message: 'Callback processed' };
    const outcome = await adapter.parseCallback(payload, headers);
    const row = await this.rows.findOne({
      where: [{ reference }, { externalReference: reference }],
    });
    if (!row) return { message: 'Callback processed' };
    if (row.status === TransactionStatus.SUCCESS) {
      return { message: 'Callback processed' };
    }
    row.status = outcome.status;
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
    return { message: 'Callback processed', transaction: row };
  }

  async markSuccess(reference: string) {
    const row = await this.findByReference(reference);
    row.status = TransactionStatus.SUCCESS;
    await this.rows.save(row);
    await this.markOrderPaid(row);
    this.audit.log({
      type: AuditLogType.PAYMENT,
      action: PaymentAuditAction.SUCCESS,
      resourceType: 'transaction',
      resourceId: row.id,
    });
    return row;
  }

  private async markOrderPaid(row: TransactionEntity) {
    const order = await this.orders.findOne({
      where: row.orderId
        ? { id: row.orderId }
        : { orderNumber: row.reference },
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
