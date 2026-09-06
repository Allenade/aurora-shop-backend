import { DatabaseEntity, WithTimestamps } from '@app/shared';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { ProductEntity } from '../../catalog/entities/product.entity';

@Entity('inventory')
@WithTimestamps()
export class InventoryEntity extends DatabaseEntity {
  @Column({ name: 'product_id', type: 'uuid', unique: true })
  productId: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'min_stock', type: 'int', default: 5 })
  minStock: number;

  @Column({ name: 'reserved', type: 'int', default: 0 })
  reserved: number;

  @OneToOne(() => ProductEntity, (product) => product.inventory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity;
}
