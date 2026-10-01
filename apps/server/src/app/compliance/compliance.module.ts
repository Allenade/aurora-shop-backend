import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CourseEntity } from '../course/entities/course.entity';
import { EnterFirstModule } from '../enter-first/enter-first.module';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { OrgSettingsModule } from '../org-settings/org-settings.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { DataRequestEntity } from './entities/data-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnterFirstEnrollmentEntity,
      CourseEntity,
      DataRequestEntity,
    ]),
    EnterFirstModule,
    OrgSettingsModule,
    AuthModule,
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}
