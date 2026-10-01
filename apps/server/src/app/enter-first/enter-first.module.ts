import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module';
import { CourseModule } from '../course/course.module';
import { MailModule } from '../mail/mail.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { EnterFirstController } from './enter-first.controller';
import { EnterFirstService } from './enter-first.service';
import { EnterFirstEnrollmentEntity } from './entities/enter-first-enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EnterFirstEnrollmentEntity]),
    PaymentGatewayModule,
    MailModule,
    CourseModule,
    AccessModule,
  ],
  controllers: [EnterFirstController],
  providers: [EnterFirstService],
  exports: [EnterFirstService],
})
export class EnterFirstModule {}
