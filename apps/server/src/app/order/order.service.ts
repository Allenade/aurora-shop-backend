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
import { UserRepository } from '../user/repositories/user.repository';
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
    private readonly users: UserRepository,
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
    await this.saveDefaultShippingFromCheckout(input);

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

  async listForUser(
    userId: string,
    isAdmin: boolean,
    query?: {
      q?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const qb = this.orders
      .createQueryBuilder('o')
      .orderBy('o.createdAt', 'DESC');

    if (!isAdmin) {
      qb.andWhere('o.userId = :userId', { userId });
    }

    if (query?.q) {
      qb.andWhere(
        `(o.orderNumber ILIKE :q OR o.trackingNumber ILIKE :q OR o.shippingName ILIKE :q OR o.shippingEmail ILIKE :q OR COALESCE(o.transactionReference, '') ILIKE :q)`,
        { q: `%${query.q}%` },
      );
    }

    if (query?.status?.trim()) {
      const allowed = new Set([
        'pending',
        'in_transit',
        'delivered',
        'cancelled',
      ]);
      const statuses = query.status
        .split(',')
        .map((part) => part.trim())
        .filter((part) => allowed.has(part));
      if (statuses.length === 1) {
        qb.andWhere('o.status = :status', { status: statuses[0] });
      } else if (statuses.length > 1) {
        qb.andWhere('o.status IN (:...statuses)', { statuses });
      }
    }

    const paginate = query?.page !== undefined || query?.limit !== undefined;
    if (!paginate) {
      const rows = await qb.getMany();
      return rows.map((row) => this.toDto(row));
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async countsForUser(userId: string, isAdmin: boolean) {
    const qb = this.orders
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status');

    if (!isAdmin) {
      qb.where('o.userId = :userId', { userId });
    }

    const rows = await qb.getRawMany<{ status: string; count: string }>();
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      byStatus[row.status] = Number(row.count) || 0;
    }

    const pending = (byStatus.pending ?? 0) + (byStatus.in_transit ?? 0);
    const completed = byStatus.delivered ?? 0;
    const cancelled = byStatus.cancelled ?? 0;

    return {
      all: pending + completed + cancelled,
      completed,
      pending,
      cancelled,
    };
  }

  async dashboardForUser(userId: string) {
    const counts = await this.countsForUser(userId, false);

    const spentRow = await this.orders
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total), 0)', 'spent')
      .where('o.userId = :userId', { userId })
      .andWhere("o.status <> 'cancelled'")
      .getRawOne<{ spent: string }>();
    const spent = Number(spentRow?.spent) || 0;

    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [thisMonth, lastMonth] = await Promise.all([
      this.orders
        .createQueryBuilder('o')
        .where('o.userId = :userId', { userId })
        .andWhere('o.createdAt >= :start', { start: startThisMonth })
        .getCount(),
      this.orders
        .createQueryBuilder('o')
        .where('o.userId = :userId', { userId })
        .andWhere('o.createdAt >= :start', { start: startLastMonth })
        .andWhere('o.createdAt < :end', { end: startThisMonth })
        .getCount(),
    ]);

    let trend: string | undefined;
    if (thisMonth > 0 || lastMonth > 0) {
      if (lastMonth === 0) {
        trend = '+100% from last month';
      } else {
        const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
        trend = `${pct >= 0 ? '+' : ''}${pct}% from last month`;
      }
    }

    const since = new Date();
    since.setDate(since.getDate() - 60);
    const recentRows = await this.orders
      .createQueryBuilder('o')
      .where('o.userId = :userId', { userId })
      .andWhere('o.createdAt >= :since', { since })
      .orderBy('o.createdAt', 'DESC')
      .take(5)
      .getMany();
    const recentOrders = recentRows.map((row) => {
      const dto = this.toDto(row);
      return {
        id: dto.id,
        date: dto.date,
        items: dto.itemCount,
        total: dto.total,
        status: dto.status as
          'In Transit' | 'Delivered' | 'Pending' | 'Cancelled',
      };
    });

    return {
      stats: [
        {
          id: 'total',
          label: 'Total Purchases',
          value: String(counts.all),
          ...(trend ? { trend } : {}),
          icon: 'bag' as const,
        },
        {
          id: 'pending',
          label: 'Pending Purchases',
          value: String(counts.pending),
          icon: 'clock' as const,
        },
        {
          id: 'spent',
          label: 'Total Spent',
          value: `₦${spent.toLocaleString('en-NG')}`,
          icon: 'spend' as const,
        },
      ],
      recentOrders,
    };
  }

  async getById(id: string, userId: string, isAdmin: boolean) {
    const key = id.trim();
    const row = await this.orders
      .createQueryBuilder('o')
      .where(
        'o.id::text = :key OR LOWER(o.orderNumber) = LOWER(:key) OR LOWER(o.trackingNumber) = LOWER(:key)',
        { key },
      )
      .getOne();
    if (!row || (!isAdmin && row.userId !== userId)) {
      throw new NotFoundException('Order not found');
    }
    return this.toDto(row);
  }

  async track(query: string) {
    const key = query.trim();
    if (!key) throw new NotFoundException('Shipment not found');

    const row = await this.orders
      .createQueryBuilder('o')
      .where(
        'LOWER(o.trackingNumber) = LOWER(:key) OR LOWER(o.orderNumber) = LOWER(:key)',
        { key },
      )
      .getOne();
    if (!row) throw new NotFoundException('Shipment not found');

    const eta = new Date(row.createdAt);
    eta.setDate(eta.getDate() + (row.deliveryMethod === 'express' ? 2 : 5));

    const descriptions: Record<string, string> = {
      placed: 'Your order has been received and confirmed',
      payment: 'Waiting for payment confirmation',
      ship: 'Package handed over to courier',
      deliver: 'Package delivered to recipient',
    };

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
        description: descriptions[step.id] ?? step.label,
        at: step.at
          ? (() => {
              const parsed = new Date(step.at);
              if (Number.isNaN(parsed.getTime())) return step.at;
              return parsed.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
            })()
          : '',
        status:
          step.status === 'done'
            ? 'done'
            : step.status === 'current'
              ? 'current'
              : 'upcoming',
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

  /** Persist checkout delivery fields as the buyer's next-form defaults. */
  private async saveDefaultShippingFromCheckout(input: CheckoutInput) {
    const user = await this.users.findById(input.userId);
    if (!user) return;
    user.defaultShipping = {
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
      streetAddress: input.streetAddress.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      note: input.note?.trim() || undefined,
    };
    await this.users.save(user);
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
        slug: item.slug,
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
