import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toShopProduct } from '../catalog/catalog.service';
import { ProductEntity } from '../catalog/entities/product.entity';
import { InventoryEntity } from './entities/inventory.entity';
import { queryRows } from '../../common/db/query-rows';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventory: Repository<InventoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  private toListItem(product: ProductEntity) {
    const view = toShopProduct(product);
    return {
      ...view,
      quantity: product.inventory?.quantity ?? 0,
      reserved: product.inventory?.reserved ?? 0,
      minStock: product.inventory?.minStock ?? 5,
      lastRestocked: product.inventory?.updatedAt
        ? product.inventory.updatedAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '—',
      warehouse: 'Lagos HQ',
    };
  }

  async list(query?: {
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .orderBy('product.createdAt', 'DESC');

    if (query?.q) {
      qb.andWhere(
        '(product.name ILIKE :q OR product.sku ILIKE :q OR product.category ILIKE :q OR product.subtitle ILIKE :q OR product.brand ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    if (query?.status) {
      const quantity = 'COALESCE(inventory.quantity, 0)';
      const minStock = 'COALESCE(inventory.min_stock, 5)';
      const criticalMax = `GREATEST(1, FLOOR((${minStock}) / 2))`;
      if (query.status === 'out_of_stock') {
        qb.andWhere(`${quantity} <= 0`);
      } else if (query.status === 'critical') {
        qb.andWhere(`${quantity} > 0 AND ${quantity} <= ${criticalMax}`);
      } else if (query.status === 'low_stock') {
        qb.andWhere(
          `${quantity} > ${criticalMax} AND ${quantity} <= ${minStock}`,
        );
      } else if (query.status === 'in_stock') {
        qb.andWhere(`${quantity} > ${minStock}`);
      }
    }

    const paginate = query?.page !== undefined || query?.limit !== undefined;
    if (!paginate) {
      const rows = await qb.getMany();
      return rows.map((product) => this.toListItem(product));
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const items = rows.map((product) => this.toListItem(product));
    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async restock(productId: string, quantity: number) {
    const rows = queryRows(
      await this.inventory.query(
        `UPDATE inventory
         SET quantity = quantity + $2, updated_at = NOW()
         WHERE product_id = $1
         RETURNING quantity`,
        [productId, quantity],
      ),
    );
    const updated = rows[0];
    if (!updated) throw new NotFoundException('Inventory row not found');
    return { ok: true, quantity: Number(updated.quantity) };
  }

  async reserve(productId: string, qty: number) {
    const rows = queryRows(
      await this.inventory.query(
        `UPDATE inventory
         SET reserved = reserved + $2, updated_at = NOW()
         WHERE product_id = $1
           AND quantity - reserved >= $2
         RETURNING reserved`,
        [productId, qty],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Insufficient stock');
  }

  async commitReserved(productId: string, qty: number) {
    await this.inventory.query(
      `UPDATE inventory
       SET reserved = GREATEST(reserved - $2, 0),
           quantity = GREATEST(quantity - $2, 0),
           updated_at = NOW()
       WHERE product_id = $1`,
      [productId, qty],
    );
  }

  async releaseReserved(productId: string, qty: number) {
    await this.inventory.query(
      `UPDATE inventory
       SET reserved = GREATEST(reserved - $2, 0), updated_at = NOW()
       WHERE product_id = $1`,
      [productId, qty],
    );
  }
}
