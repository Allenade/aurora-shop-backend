import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from '../course/entities/course.entity';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { StorageModule } from '../storage/storage.module';
import { EmailController } from './email.controller';
import { EmailAssetService } from './email-asset.service';
import { EmailService } from './email.service';
import {
  EmailCampaignEntity,
  EmailMessageEntity,
  EmailSuppressionEntity,
  EmailTemplateEntity,
} from './entities/email.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailTemplateEntity,
      EmailCampaignEntity,
      EmailMessageEntity,
      EmailSuppressionEntity,
      EnterFirstEnrollmentEntity,
      CourseEntity,
    ]),
    StorageModule,
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailAssetService],
  exports: [EmailService],
})
export class EmailModule {}
