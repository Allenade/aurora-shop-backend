import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toShopProduct } from '../catalog/catalog.service';
import { ProductEntity } from '../catalog/entities/product.entity';
import { InventoryEntity } from './entities/inventory.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventory: Repository<InventoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async list() {
    const rows = await this.products.find({
      relations: { inventory: true },
      order: { name: 'ASC' },
    });
    return rows.map((product) => {
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
    });
  }

  async restock(productId: string, quantity: number) {
    const row = await this.inventory.findOne({ where: { productId } });
    if (!row) throw new NotFoundException('Inventory row not found');
    row.quantity += quantity;
    await this.inventory.save(row);
    return { ok: true, quantity: row.quantity };
  }

  async reserve(productId: string, qty: number) {
    const row = await this.inventory.findOne({ where: { productId } });
    if (!row || row.quantity - row.reserved < qty) {
      throw new NotFoundException('Insufficient stock');
    }
    row.reserved += qty;
    await this.inventory.save(row);
  }

  async commitReserved(productId: string, qty: number) {
    const row = await this.inventory.findOne({ where: { productId } });
    if (!row) return;
    row.reserved = Math.max(0, row.reserved - qty);
    row.quantity = Math.max(0, row.quantity - qty);
    await this.inventory.save(row);
  }

  async releaseReserved(productId: string, qty: number) {
    const row = await this.inventory.findOne({ where: { productId } });
    if (!row) return;
    row.reserved = Math.max(0, row.reserved - qty);
    await this.inventory.save(row);
  }
}
