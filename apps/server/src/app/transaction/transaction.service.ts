import {
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
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
  type ConfirmationSource,
  type RegisterContext,
} from '../payment-gateway/_contract/payment.types';
import { PaystackProvider } from '../payment-gateway/paystack/paystack.provider';
import { reconcileProviderStatus } from '../payment-gateway/paystack/reconcile-charge';
import { OrderEntity } from '../order/entities/order.entity';
import { pollProviderPaymentStatus } from './poll-provider-payment-status';
import { TransactionEntity } from './entities/transaction.entity';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

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
    if (input.provider === TransactionProvider.BANK) {
      throw new GoneException(
        'Manual bank transfer is no longer available. Pay with Paystack (card or Pay with Transfer).',
      );
    }
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
    provider: string,
    payload: unknown,
    headers?: Record<string, string>,
    rawBody?: Buffer | string,
  ) {
    if (provider === 'bank') {
      throw new GoneException(
        'Bank transfer callbacks are disabled. Bank payments settle through Paystack Pay with Transfer.',
      );
    }
    if (provider !== 'paystack') {
      return { message: 'Callback processed' };
    }
    const adapter = this.registry.get(TransactionProvider.PAYSTACK);
    const reference = adapter.extractCallbackReference(payload, headers);
    if (!reference) return { message: 'Callback processed' };
    const outcome = await adapter.parseCallback(payload, headers, rawBody);
    if (outcome.signatureValid === false) {
      this.logger.warn(`Ignored unsigned Paystack callback for ${reference}`);
      return { message: 'Callback processed' };
    }
    const row = await this.rows.findOne({
      where: [{ reference }, { externalReference: reference }],
    });
    if (!row) {
      const enterFirst = await this.enterFirst.handleProviderCallback(
        outcome,
        'webhook',
      );
      if (enterFirst.handled) {
        return { message: 'Callback processed', enterFirst };
      }
      return { message: 'Callback processed' };
    }
    if (row.status === TransactionStatus.SUCCESS) {
      return { message: 'Callback processed' };
    }
    await this.applyVerifiedOutcome(row, outcome, 'webhook');
    return { message: 'Callback processed', transaction: row };
  }

  /** Ask Paystack whether a pending reference has been paid yet. */
  async verifyForUser(reference: string, userId: string, isAdmin: boolean) {
    const row = await this.findByReference(reference);
    if (!isAdmin && row.userId && row.userId !== userId) {
      throw new ForbiddenException('Transaction not yours');
    }
    if (row.status !== TransactionStatus.PENDING) return this.toStatusDto(row);
    await this.reverify(row, 'poll');
    return this.toStatusDto(row);
  }

  /**
   * Admin re-check. Does not mark a payment successful unless Paystack
   * verifies the reference, amount, and currency.
   */
  async confirmWithProvider(reference: string) {
    const row = await this.findByReference(reference);
    if (row.status === TransactionStatus.SUCCESS) return this.toStatusDto(row);
    await this.reverify(row, 'admin');
    return this.toStatusDto(row);
  }

  private async reverify(row: TransactionEntity, source: ConfirmationSource) {
    const ref = row.externalReference ?? row.reference;
    const outcome = await pollProviderPaymentStatus(
      row.provider,
      ref,
      { paystack: this.paystack },
      { amount: row.amount, currency: 'NGN' },
    );
    await this.applyVerifiedOutcome(row, outcome, source);
  }

  private async applyVerifiedOutcome(
    row: TransactionEntity,
    outcome: CallbackOutcome,
    source: ConfirmationSource,
  ) {
    if (outcome.signatureValid === false) return;
    if (outcome.status === TransactionStatus.PENDING && !outcome.charge) {
      return;
    }
    const decision = reconcileProviderStatus({
      providerStatus: outcome.status,
      charge: outcome.charge,
      expectedAmount: row.amount,
      expectedCurrency: 'NGN',
    });
    row.metadata = {
      ...(row.metadata ?? {}),
      paystackTransactionId: decision.charge.transactionId,
      paidAmount: decision.charge.paidAmount,
      paidCurrency: decision.charge.currency,
      channel: decision.charge.channel,
      amountMatches: decision.amountMatches,
      currencyMatches: decision.currencyMatches,
      confirmationSource: source,
      verifiedAt:
        outcome.status === TransactionStatus.PENDING
          ? row.metadata?.verifiedAt
          : new Date().toISOString(),
    };
    if (decision.status === TransactionStatus.PENDING) {
      await this.rows.save(row);
      if (!decision.amountMatches || !decision.currencyMatches) {
        this.logger.warn(
          `Paystack amount/currency mismatch for ${row.reference}`,
        );
      }
      return;
    }
    row.status = decision.status;
    await this.rows.save(row);
    if (decision.status === TransactionStatus.SUCCESS) {
      await this.markOrderPaid(row);
    }
    this.audit.log({
      type: AuditLogType.PAYMENT,
      action:
        decision.status === TransactionStatus.SUCCESS
          ? PaymentAuditAction.SUCCESS
          : PaymentAuditAction.FAILED,
      resourceType: 'transaction',
      resourceId: row.id,
      userId: row.userId,
      metadata: { confirmationSource: source },
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
