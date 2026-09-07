import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async list(query?: { category?: string; brand?: string; q?: string }) {
    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory')
      .orderBy('product.name', 'ASC');
    if (query?.category) {
      qb.andWhere('product.category = :category', { category: query.category });
    }
    if (query?.brand) {
      qb.andWhere('product.brand = :brand', { brand: query.brand });
    }
    if (query?.q) {
      qb.andWhere('product.name ILIKE :q', { q: `%${query.q}%` });
    }
    const rows = await qb.getMany();
    return rows.map(toShopProduct);
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
    const product = this.products.create({
      ...input,
      inventory: {
        quantity: input.quantity ?? 0,
        minStock: input.minStock ?? 5,
      },
    });
    const saved = await this.products.save(product);
    return this.getBySlug(saved.slug);
  }

  async update(id: string, input: Partial<ProductEntity>) {
    const product = await this.products.findOne({
      where: { id },
      relations: { inventory: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    Object.assign(product, input);
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
