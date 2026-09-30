import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnterFirstModule } from '../enter-first/enter-first.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderEntity } from '../order/entities/order.entity';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { TransactionEntity } from './entities/transaction.entity';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, OrderEntity]),
    PaymentGatewayModule,
    InventoryModule,
    forwardRef(() => EnterFirstModule),
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
