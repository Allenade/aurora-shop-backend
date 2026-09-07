import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, OneToOne } from 'typeorm';
import { InventoryEntity } from '../../inventory/entities/inventory.entity';

export type StockStatus =
  'in_stock' | 'low_stock' | 'critical' | 'out_of_stock';

@Entity('product')
@WithTimestamps()
export class ProductEntity extends DatabaseEntity {
  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ default: '' })
  subtitle: string;

  @Column()
  category: string;

  @Column()
  brand: string;

  @Column({ default: '' })
  subcategory: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ name: 'unit_label', default: 'Per unit' })
  unitLabel: string;

  @Column({ name: 'is_new', default: false })
  isNew: boolean;

  @Column({ name: 'image_url', default: '/images/auth-panel.png' })
  image: string;

  @Column({ type: 'jsonb', default: [] })
  images: string[];

  @Column({ type: 'jsonb', default: [] })
  specs: Array<{ label: string; value: string }>;

  @Column({ type: 'jsonb', default: [] })
  highlights: Array<{ label: string; icon: string }>;

  @Column({ name: 'datasheet_note', default: '' })
  datasheetNote: string;

  @Column({ name: 'reviews_note', default: '' })
  reviewsNote: string;

  @Column({ name: 'sku', default: '' })
  sku: string;

  @OneToOne(() => InventoryEntity, (inventory) => inventory.product, {
    cascade: true,
  })
  inventory?: InventoryEntity;
}
