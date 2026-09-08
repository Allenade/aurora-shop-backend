import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryEntity } from '../inventory/entities/inventory.entity';
import { ProductEntity, type StockStatus } from './entities/product.entity';

function stockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= Math.max(1, Math.floor(minStock / 2))) return 'critical';
  if (quantity <= minStock) return 'low_stock';
  return 'in_stock';
}

function badge(status: StockStatus, isNew: boolean) {
  if (status === 'out_of_stock') return 'Out of Stock';
  if (status === 'low_stock' || status === 'critical') return 'Low Stock';
  if (isNew) return 'New';
  return 'In Stock';
}

export function toShopProduct(product: ProductEntity) {
  const qty = product.inventory?.quantity ?? 0;
  const min = product.inventory?.minStock ?? 5;
  const status = stockStatus(qty, min);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    category: product.category,
    brand: product.brand,
    subcategory: product.subcategory,
    price: product.price,
    priceLabel: `₦${product.price.toLocaleString('en-NG')}`,
    unitLabel: product.unitLabel,
    badge: badge(status, product.isNew),
    stockStatus: status === 'critical' ? 'low_stock' : status,
    stockCount: qty,
    image: product.image,
    images: product.images,
    isNew: product.isNew,
    highlights: product.highlights,
    specs: product.specs,
    datasheetNote: product.datasheetNote,
    reviewsNote: product.reviewsNote,
    sku: product.sku,
    minStock: min,
  };
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async list(query?: {
    category?: string;
    brand?: string;
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .orderBy('product.createdAt', 'DESC');
    if (query?.category) {
      qb.andWhere('product.category = :category', { category: query.category });
    }
    if (query?.brand) {
      qb.andWhere('product.brand = :brand', { brand: query.brand });
    }
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

    const paginate =
      query?.page !== undefined || query?.limit !== undefined;
    if (!paginate) {
      const rows = await qb.getMany();
      return rows.map(toShopProduct);
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const items = rows.map(toShopProduct);
    return {
      items,
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getBySlug(slug: string) {
    const product = await this.products.findOne({
      where: { slug },
      relations: { inventory: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return toShopProduct(product);
  }

  async create(
    input: Partial<ProductEntity> & { quantity?: number; minStock?: number },
  ) {
    const { quantity, minStock, ...productFields } = input;
    const product = this.products.create({
      ...productFields,
      inventory: {
        quantity: quantity ?? 0,
        minStock: minStock ?? 5,
      },
    });
    const saved = await this.products.save(product);
    return this.getBySlug(saved.slug);
  }

  async update(
    id: string,
    input: Partial<ProductEntity> & { quantity?: number; minStock?: number },
  ) {
    const product = await this.products.findOne({
      where: { id },
      relations: { inventory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const { quantity, minStock, ...productFields } = input;
    Object.assign(product, productFields);

    if (!product.inventory) {
      product.inventory = Object.assign(new InventoryEntity(), {
        quantity: quantity ?? 0,
        minStock: minStock ?? 5,
      });
    } else {
      if (quantity !== undefined) {
        product.inventory.quantity = Number(quantity);
      }
      if (minStock !== undefined) {
        product.inventory.minStock = Number(minStock);
      }
    }

    await this.products.save(product);
    return this.getBySlug(product.slug);
  }

  async remove(id: string) {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    await this.products.softDelete(id);
    return { ok: true };
  }
}
