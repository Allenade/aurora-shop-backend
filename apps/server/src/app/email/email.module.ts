import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from '../course/entities/course.entity';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { StorageModule } from '../storage/storage.module';
import { EmailController } from './email.controller';
import { EmailQueueService } from './email-queue.service';
import { EmailService } from './email.service';
import {
  EmailCampaignEntity,
  EmailMessageEntity,
  EmailSegmentEntity,
  EmailSuppressionEntity,
  EmailTemplateEntity,
} from './entities/email.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailTemplateEntity,
      EmailSegmentEntity,
      EmailCampaignEntity,
      EmailMessageEntity,
      EmailSuppressionEntity,
      EnterFirstEnrollmentEntity,
      CourseEntity,
    ]),
    StorageModule,
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailQueueService],
  exports: [EmailService],
})
export class EmailModule {}
