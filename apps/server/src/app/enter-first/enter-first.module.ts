import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseModule } from '../course/course.module';
import { EmailModule } from '../email/email.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { RefundRequestEntity } from '../refund/entities/refund-request.entity';
import { UserModule } from '../user/user.module';
import { EnterFirstController } from './enter-first.controller';
import { EnterFirstInviteService } from './enter-first-invite.service';
import { EnterFirstPeopleService } from './enter-first-people.service';
import { EnterFirstService } from './enter-first.service';
import { EnterFirstEnrollmentEntity } from './entities/enter-first-enrollment.entity';
import { EnterFirstInviteEntity } from './entities/enter-first-invite.entity';
import { EnterFirstPersonEntity } from './entities/enter-first-person.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnterFirstEnrollmentEntity,
      EnterFirstPersonEntity,
      EnterFirstInviteEntity,
      RefundRequestEntity,
    ]),
    PaymentGatewayModule,
    EmailModule,
    CourseModule,
    AuthModule,
    UserModule,
  ],
  controllers: [EnterFirstController],
  providers: [
    EnterFirstService,
    EnterFirstPeopleService,
    EnterFirstInviteService,
  ],
  exports: [EnterFirstService, TypeOrmModule],
})
export class EnterFirstModule {}
