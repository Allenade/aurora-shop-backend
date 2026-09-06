import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from '../catalog/entities/product.entity';
import { InventoryEntity } from '../inventory/entities/inventory.entity';
import { OrderEntity } from '../order/entities/order.entity';
import { QuoteEntity } from '../procurement/entities/quote.entity';
import { UserEntity } from '../user/entities/user.entity';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      UserEntity,
      ProductEntity,
      InventoryEntity,
      QuoteEntity,
    ]),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
