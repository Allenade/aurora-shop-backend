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

function splitCsv(value?: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
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
    images:
      Array.isArray(product.images) && product.images.length > 0
        ? product.images.slice(0, 5)
        : [product.image],
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
    maxPrice?: number;
    minPrice?: number;
    page?: number;
    limit?: number;
    offset?: number;
    sort?: string;
    seed?: string;
  }) {
    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.inventory', 'inventory');

    const categories = splitCsv(query?.category);
    if (categories.length === 1) {
      qb.andWhere('product.category = :category', { category: categories[0] });
    } else if (categories.length > 1) {
      qb.andWhere('product.category IN (:...categories)', { categories });
    }

    const brands = splitCsv(query?.brand);
    if (brands.length === 1) {
      qb.andWhere('product.brand = :brand', { brand: brands[0] });
    } else if (brands.length > 1) {
      qb.andWhere('product.brand IN (:...brands)', { brands });
    }

    if (query?.q) {
      qb.andWhere(
        '(product.name ILIKE :q OR product.sku ILIKE :q OR product.category ILIKE :q OR product.subtitle ILIKE :q OR product.brand ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    if (query?.maxPrice !== undefined && Number.isFinite(query.maxPrice)) {
      qb.andWhere('product.price <= :maxPrice', {
        maxPrice: Math.max(0, Number(query.maxPrice)),
      });
    }
    if (query?.minPrice !== undefined && Number.isFinite(query.minPrice)) {
      qb.andWhere('product.price >= :minPrice', {
        minPrice: Math.max(0, Number(query.minPrice)),
      });
    }

    this.applyStatusFilter(qb, query?.status);

    const useOffset = query?.offset !== undefined;
    const paginate =
      useOffset || query?.page !== undefined || query?.limit !== undefined;

    if (!paginate) {
      this.applySort(qb, query?.sort, query?.seed);
      const rows = await qb.getMany();
      return rows.map(toShopProduct);
    }

    // Count before ORDER BY — expression/alias sorts break getCount() on Postgres.
    const total = await qb.clone().getCount();
    const catalogMaxPrice = await this.catalogMaxPrice();
    const facets = await this.catalogFacets();

    this.applySort(qb, query?.sort, query?.seed);

    const limit = Math.min(50, Math.max(1, Number(query?.limit) || 10));
    let offset: number;
    let page: number;
    if (useOffset) {
      offset = Math.max(0, Number(query?.offset) || 0);
      page = Math.floor(offset / limit) + 1;
    } else {
      page = Math.max(1, Number(query?.page) || 1);
      offset = (page - 1) * limit;
    }

    const rows = await qb.skip(offset).take(limit).getMany();
    return {
      items: rows.map(toShopProduct),
      total,
      page,
      limit,
      offset,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      catalogMaxPrice,
      categories: facets.categories,
      brands: facets.brands,
    };
  }

  private applySort(
    qb: ReturnType<Repository<ProductEntity>['createQueryBuilder']>,
    sort?: string,
    seedRaw?: string,
  ) {
    if (sort?.trim().toLowerCase() === 'random') {
      // Sanitize then inline — avoids Postgres "could not determine data type of parameter".
      const seed =
        (seedRaw?.trim() || 'aurora')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64) || 'aurora';
      qb.addSelect(
        `md5(concat(product.id::text, '${seed}'))`,
        'shuffle_key',
      ).orderBy('shuffle_key', 'ASC');
      return;
    }
    qb.orderBy('product.createdAt', 'DESC');
  }

  private applyStatusFilter(
    qb: ReturnType<Repository<ProductEntity>['createQueryBuilder']>,
    statusCsv?: string,
  ) {
    const statuses = splitCsv(statusCsv);
    if (statuses.length === 0) return;

    const quantity = 'COALESCE(inventory.quantity, 0)';
    const minStock = 'COALESCE(inventory.min_stock, 5)';
    const criticalMax = `GREATEST(1, FLOOR((${minStock}) / 2))`;
    const parts: string[] = [];

    for (const status of statuses) {
      if (status === 'out_of_stock') {
        parts.push(`(${quantity} <= 0)`);
      } else if (status === 'critical') {
        parts.push(`(${quantity} > 0 AND ${quantity} <= ${criticalMax})`);
      } else if (status === 'low_stock') {
        // Shop UI "Low Stock" includes critical + low_stock bands.
        parts.push(`(${quantity} > 0 AND ${quantity} <= ${minStock})`);
      } else if (status === 'in_stock') {
        parts.push(`(${quantity} > ${minStock})`);
      }
    }

    if (parts.length > 0) {
      qb.andWhere(`(${parts.join(' OR ')})`);
    }
  }

  private async catalogMaxPrice() {
    const raw = await this.products
      .createQueryBuilder('product')
      .select('MAX(product.price)', 'max')
      .getRawOne<{ max: string | null }>();
    return Math.max(0, Number(raw?.max ?? 0));
  }

  private async catalogFacets() {
    const categoryRows = await this.products
      .createQueryBuilder('product')
      .select('product.category', 'category')
      .groupBy('product.category')
      .orderBy('product.category', 'ASC')
      .getRawMany<{ category: string }>();
    const brandRows = await this.products
      .createQueryBuilder('product')
      .select('product.brand', 'brand')
      .groupBy('product.brand')
      .orderBy('product.brand', 'ASC')
      .getRawMany<{ brand: string }>();

    return {
      categories: categoryRows.map((row) => row.category).filter(Boolean),
      brands: brandRows.map((row) => row.brand).filter(Boolean),
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

  private normalizeImages(input: Partial<ProductEntity>): {
    image: string;
    images: string[];
  } {
    const fromList = Array.isArray(input.images)
      ? input.images.filter(
          (url): url is string =>
            typeof url === 'string' && url.trim().length > 0,
        )
      : [];
    const primary =
      typeof input.image === 'string' && input.image.trim()
        ? input.image.trim()
        : fromList[0];
    const merged = [
      ...(primary ? [primary] : []),
      ...fromList.filter((url) => url !== primary),
    ].slice(0, 5);
    const fallback = '/images/auth-panel.png';
    const images = merged.length > 0 ? merged : [fallback];
    return { image: images[0], images };
  }

  async create(
    input: Partial<ProductEntity> & { quantity?: number; minStock?: number },
  ) {
    const { quantity, minStock, ...productFields } = input;
    const { image, images } = this.normalizeImages(productFields);
    const product = this.products.create({
      ...productFields,
      image,
      images,
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
    if (
      productFields.image !== undefined ||
      productFields.images !== undefined
    ) {
      const normalized = this.normalizeImages({
        image: product.image,
        images: product.images,
      });
      product.image = normalized.image;
      product.images = normalized.images;
    }

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
