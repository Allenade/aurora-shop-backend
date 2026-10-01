import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from '../audit-log/entities/audit-log.entity';
import { CourseModule } from '../course/course.module';
import { EmailMessageEntity } from '../email/entities/email.entities';
import { EnterFirstModule } from '../enter-first/enter-first.module';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { DataRequestEntity } from './entities/data-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnterFirstEnrollmentEntity,
      DataRequestEntity,
      AuditLogEntity,
      EmailMessageEntity,
    ]),
    CourseModule,
    EnterFirstModule,
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
