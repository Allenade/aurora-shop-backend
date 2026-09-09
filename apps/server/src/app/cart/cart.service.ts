import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ProductEntity } from '../catalog/entities/product.entity';
import { CartItemEntity } from './entities/cart-item.entity';

export type CartItemDto = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  priceLabel: string;
  stockCount: number;
  qty: number;
};

export type CartDto = {
  items: CartItemDto[];
  itemCount: number;
};

@Injectable()
export class CartService implements OnModuleInit {
  constructor(
    @InjectRepository(CartItemEntity)
    private readonly items: Repository<CartItemEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS cart_item (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        product_id uuid NOT NULL,
        qty int NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cart_item_user_product UNIQUE (user_id, product_id)
      );
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_cart_item_user_id ON cart_item (user_id);
    `);
  }

  async getCart(userId: string): Promise<CartDto> {
    const rows = await this.items.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return this.toCartDto(rows);
  }

  async setItem(
    userId: string,
    input: { slug: string; qty: number },
  ): Promise<CartDto> {
    const slug = input.slug?.trim();
    if (!slug) throw new BadRequestException('Product slug is required');

    const qty = Math.floor(Number(input.qty));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    const product = await this.products.findOne({
      where: { slug },
      relations: { inventory: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const stock = product.inventory?.quantity ?? 0;
    if (stock <= 0) {
      throw new BadRequestException('Product is out of stock');
    }
    const nextQty = Math.min(qty, stock);

    let row = await this.items.findOne({
      where: { userId, productId: product.id },
    });
    if (!row) {
      row = this.items.create({
        userId,
        productId: product.id,
        qty: nextQty,
      });
    } else {
      row.qty = nextQty;
    }
    await this.items.save(row);
    return this.getCart(userId);
  }

  async removeItem(userId: string, slug: string): Promise<CartDto> {
    const product = await this.products.findOne({ where: { slug } });
    if (!product) throw new NotFoundException('Product not found');

    await this.items.delete({ userId, productId: product.id });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartDto> {
    await this.items.delete({ userId });
    return { items: [], itemCount: 0 };
  }

  private async toCartDto(rows: CartItemEntity[]): Promise<CartDto> {
    if (rows.length === 0) return { items: [], itemCount: 0 };

    const productIds = rows.map((row) => row.productId);
    const products = await this.products.find({
      where: { id: In(productIds) },
      relations: { inventory: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const stale: string[] = [];
    const items: CartItemDto[] = [];

    for (const row of rows) {
      const product = byId.get(row.productId);
      if (!product) {
        stale.push(row.id);
        continue;
      }
      const stockCount = product.inventory?.quantity ?? 0;
      const qty = Math.min(Math.max(1, row.qty), Math.max(1, stockCount || 1));
      if (stockCount <= 0) {
        stale.push(row.id);
        continue;
      }
      if (qty !== row.qty) {
        row.qty = qty;
        await this.items.save(row);
      }
      items.push({
        id: row.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: product.image,
        price: product.price,
        priceLabel: `₦${product.price.toLocaleString('en-NG')}`,
        stockCount,
        qty,
      });
    }

    if (stale.length > 0) {
      await this.items.delete({ id: In(stale) });
    }

    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    };
  }
}
