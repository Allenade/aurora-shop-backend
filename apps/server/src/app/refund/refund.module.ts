import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { RefundRequestEntity } from './entities/refund-request.entity';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefundRequestEntity, EnterFirstEnrollmentEntity]),
    PaymentGatewayModule,
  ],
  controllers: [RefundController],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
