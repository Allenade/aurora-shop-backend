import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseModule } from '../course/course.module';
import { MailModule } from '../mail/mail.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { RefundRequestEntity } from '../refund/entities/refund-request.entity';
import { UserModule } from '../user/user.module';
import { EnterFirstController } from './enter-first.controller';
import { EnterFirstService } from './enter-first.service';
import { EnterFirstEnrollmentEntity } from './entities/enter-first-enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EnterFirstEnrollmentEntity, RefundRequestEntity]),
    PaymentGatewayModule,
    MailModule,
    CourseModule,
    AuthModule,
    UserModule,
  ],
  controllers: [EnterFirstController],
  providers: [EnterFirstService],
  exports: [EnterFirstService, TypeOrmModule],
})
export class EnterFirstModule {}
