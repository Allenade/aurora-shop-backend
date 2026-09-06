import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, Index } from 'typeorm';

export type OrderStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

@Entity('shop_order')
@WithTimestamps()
export class OrderEntity extends DatabaseEntity {
  @Index({ unique: true })
  @Column({ name: 'order_number' })
  orderNumber: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: OrderStatus;

  @Column({ name: 'payment_status', type: 'varchar', default: 'unpaid' })
  paymentStatus: PaymentStatus;

  @Column({ name: 'payment_method', type: 'varchar' })
  paymentMethod: 'bank' | 'card';

  @Column({ name: 'tracking_number', unique: true })
  trackingNumber: string;

  @Column({ name: 'transaction_reference', nullable: true })
  transactionReference?: string;

  @Column({ type: 'int' })
  subtotal: number;

  @Column({ type: 'int' })
  shipping: number;

  @Column({ type: 'int' })
  tax: number;

  @Column({ type: 'int' })
  total: number;

  @Column({ name: 'delivery_method' })
  deliveryMethod: string;

  @Column({ name: 'shipping_name' })
  shippingName: string;

  @Column({ name: 'shipping_email' })
  shippingEmail: string;

  @Column({ name: 'shipping_phone' })
  shippingPhone: string;

  @Column({ name: 'shipping_address' })
  shippingAddress: string;

  @Column({ name: 'idempotency_key', nullable: true, unique: true })
  idempotencyKey?: string;

  @Column({ type: 'jsonb' })
  items: Array<{
    productId: string;
    slug: string;
    name: string;
    sku: string;
    qty: number;
    unitPrice: number;
    image: string;
  }>;

  @Column({ type: 'jsonb', default: [] })
  timeline: Array<{ id: string; label: string; at: string; status: string }>;
}
