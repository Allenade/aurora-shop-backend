import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { EnvTypes } from '@app/shared';
import { randomInt } from 'crypto';
import { InventoryService } from '../inventory/inventory.service';
import { ProductEntity } from '../catalog/entities/product.entity';
import {
  TransactionProvider,
  TransactionStatus,
} from '../payment-gateway/_contract/payment.types';
import { TransactionService } from '../transaction/transaction.service';
import {
  OrderEntity,
  type OrderStatus,
  type PaymentStatus,
} from './entities/order.entity';

export type CheckoutInput = {
  userId: string;
  idempotencyKey?: string;
  deliveryMethod: 'standard' | 'express';
  paymentMethod: 'bank' | 'card';
  fullName: string;
  email: string;
  phone: string;
  city: string;
  streetAddress: string;
  state: string;
  note?: string;
  items: Array<{ slug: string; qty: number }>;
};

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly transactions: TransactionService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService<EnvTypes, true>,
  ) {}

  async checkout(input: CheckoutInput) {
    if (input.idempotencyKey) {
      const existing = await this.orders.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.toDto(existing);
    }

    const lines: OrderEntity['items'] = [];
    let subtotal = 0;
    for (const item of input.items) {
      const product = await this.products.findOne({
        where: { slug: item.slug },
        relations: { inventory: true },
      });
      if (!product)
        throw new BadRequestException(`Unknown product ${item.slug}`);
      await this.inventory.reserve(product.id, item.qty);
      const line = {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: product.sku || product.slug,
        qty: item.qty,
        unitPrice: product.price,
        image: product.image,
      };
      lines.push(line);
      subtotal += product.price * item.qty;
    }

    const shipping =
      input.deliveryMethod === 'express'
        ? this.config.get('commerce.deliveryExpress', { infer: true })
        : this.config.get('commerce.deliveryStandard', { infer: true });
    const tax = Math.round(
      subtotal * this.config.get('commerce.vatRate', { infer: true }),
    );
    const total = subtotal + shipping + tax;
    const year = new Date().getFullYear();
    const orderNumber = `ORD-${year}-${randomInt(100, 999)}`;
    const trackingNumber = `TRK-${randomInt(100000, 999999)}`;
    const now = new Date().toISOString();

    const order = await this.orders.save(
      this.orders.create({
        orderNumber,
        trackingNumber,
        userId: input.userId,
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: input.paymentMethod,
        subtotal,
        shipping,
        tax,
        total,
        deliveryMethod: input.deliveryMethod,
        shippingName: input.fullName,
        shippingEmail: input.email,
        shippingPhone: input.phone,
        shippingAddress: `${input.streetAddress}, ${input.city}, ${input.state}`,
        idempotencyKey: input.idempotencyKey,
        items: lines,
        timeline: [
          { id: 'placed', label: 'Order placed', at: now, status: 'done' },
          {
            id: 'payment',
            label: 'Payment confirmation',
            at: '',
            status: 'current',
          },
          { id: 'ship', label: 'Shipped', at: '', status: 'upcoming' },
          { id: 'deliver', label: 'Delivered', at: '', status: 'upcoming' },
        ],
      }),
    );

    const frontend = this.config.get('frontend.allowedOrigins', {
      infer: true,
    })[0];
    const tx = await this.transactions.create({
      amount: total,
      provider:
        input.paymentMethod === 'card'
          ? TransactionProvider.PAYSTACK
          : TransactionProvider.BANK,
      userId: input.userId,
      orderId: order.id,
      register: {
        amount: total,
        reference: orderNumber,
        email: input.email,
        firstName: input.fullName.split(' ')[0] ?? input.fullName,
        lastName: input.fullName.split(' ').slice(1).join(' ') || 'Customer',
        phone: input.phone,
        callbackUrl: `${frontend}/cart?pay=${orderNumber}`,
      },
    });
    order.transactionReference = tx.reference;
    await this.orders.save(order);

    return {
      ...this.toDto(order),
      payment: {
        provider: tx.provider,
        reference: tx.reference,
        authorizationUrl: tx.authorizationUrl,
        bank: (tx as { bank?: unknown }).bank,
        publicKey: (tx as { publicKey?: string }).publicKey,
      },
    };
  }

  async listForUser(userId: string, isAdmin: boolean) {
    const rows = await this.orders.find({
      where: isAdmin ? {} : { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async getById(id: string, userId: string, isAdmin: boolean) {
    const row = await this.orders.findOne({
      where: id.startsWith('ORD-') ? { orderNumber: id } : { id },
    });
    if (!row || (!isAdmin && row.userId !== userId)) {
      throw new NotFoundException('Order not found');
    }
    return this.toDto(row);
  }

  async track(query: string) {
    const row = await this.orders.findOne({
      where: [{ trackingNumber: query }, { orderNumber: query }],
    });
    if (!row) throw new NotFoundException('Shipment not found');
    const eta = new Date(row.createdAt);
    eta.setDate(eta.getDate() + (row.deliveryMethod === 'express' ? 2 : 5));
    return {
      orderId: row.orderNumber,
      trackingNumber: row.trackingNumber,
      status: this.trackLabel(row.status),
      estimatedDelivery: eta.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      shippingMethod:
        row.deliveryMethod === 'express'
          ? 'Express Delivery'
          : 'Standard Delivery',
      destination: row.shippingAddress,
      timeline: (row.timeline ?? []).map((step) => ({
        id: step.id,
        label: step.label,
        description: step.label,
        at: step.at,
        status: step.status === 'done' ? 'done' : 'upcoming',
      })),
      items: (row.items ?? []).map((item, index) => ({
        id: item.productId || `item-${index}`,
        name: item.name,
        quantity: item.qty,
        priceLabel: `₦${(item.unitPrice * item.qty).toLocaleString('en-NG')}`,
        image: item.image,
      })),
    };
  }

  async applyTransaction(reference: string, status: TransactionStatus) {
    const row = await this.orders.findOne({
      where: [{ transactionReference: reference }, { orderNumber: reference }],
    });
    if (!row) return;
    if (status === TransactionStatus.SUCCESS && row.paymentStatus !== 'paid') {
      row.paymentStatus = 'paid';
      row.timeline = row.timeline.map((step) =>
        step.id === 'payment'
          ? { ...step, status: 'done', at: new Date().toISOString() }
          : step,
      );
      await this.orders.save(row);
      for (const item of row.items) {
        await this.inventory.commitReserved(item.productId, item.qty);
      }
    }
  }

  async adminSetStatus(id: string, status: OrderStatus) {
    const row = await this.orders.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Order not found');
    row.status = status;
    await this.orders.save(row);
    return this.toDto(row);
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async cancelUnpaid() {
    const hours = this.config.get('commerce.unpaidCancelHours', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - hours * 3600_000);
    const stale = await this.orders.find({
      where: {
        paymentStatus: 'unpaid' as PaymentStatus,
        paymentMethod: 'bank',
        createdAt: LessThan(cutoff),
      },
    });
    for (const order of stale) {
      if (order.status === 'cancelled') continue;
      order.status = 'cancelled';
      await this.orders.save(order);
      for (const item of order.items) {
        await this.inventory.releaseReserved(item.productId, item.qty);
      }
    }
  }

  private trackLabel(status: OrderStatus) {
    if (status === 'delivered') return 'Delivered';
    if (status === 'in_transit') return 'In Transit';
    if (status === 'cancelled') return 'Cancelled';
    return 'Processing';
  }

  toDto(order: OrderEntity) {
    const paymentLabel =
      order.paymentStatus === 'paid'
        ? 'Paid'
        : order.paymentStatus === 'refunded'
          ? 'Refunded'
          : 'Unpaid';
    const statusLabel =
      order.status === 'in_transit'
        ? 'In Transit'
        : order.status === 'delivered'
          ? 'Delivered'
          : order.status === 'cancelled'
            ? 'Cancelled'
            : 'Pending';
    return {
      id: order.orderNumber,
      internalId: order.id,
      status: statusLabel,
      date: order.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      placedAt: order.createdAt.toISOString(),
      itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
      reference: order.trackingNumber,
      products: order.items.map((item) => item.name),
      total: `₦${order.total.toLocaleString('en-NG')}`,
      totalAmount: order.total,
      subtotal: order.subtotal,
      subtotalLabel: `₦${order.subtotal.toLocaleString('en-NG')}`,
      shipping: order.shipping,
      shippingLabel: `₦${order.shipping.toLocaleString('en-NG')}`,
      tax: order.tax,
      taxLabel: `₦${order.tax.toLocaleString('en-NG')}`,
      paymentMethod: order.paymentMethod === 'card' ? 'Card' : 'Bank Transfer',
      paymentStatus: paymentLabel,
      trackingNumber: order.trackingNumber,
      shippingName: order.shippingName,
      shippingEmail: order.shippingEmail,
      shippingAddress: order.shippingAddress,
      shippingPhone: order.shippingPhone,
      timeline: order.timeline,
      items: order.items.map((item) => ({
        id: item.productId,
        name: item.name,
        sku: item.sku,
        qty: item.qty,
        unitPrice: item.unitPrice,
        unitPriceLabel: `₦${item.unitPrice.toLocaleString('en-NG')}`,
        totalLabel: `₦${(item.unitPrice * item.qty).toLocaleString('en-NG')}`,
        image: item.image,
      })),
      transactionReference: order.transactionReference,
    };
  }
}
