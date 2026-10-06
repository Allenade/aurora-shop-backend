import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnterFirstEnrollmentEntity } from '../enter-first/entities/enter-first-enrollment.entity';
import { UserModule } from '../user/user.module';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CoursePriceHistoryEntity } from './entities/course-price-history.entity';
import { CourseEntity } from './entities/course.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseEntity,
      CoursePriceHistoryEntity,
      EnterFirstEnrollmentEntity,
    ]),
    UserModule,
  ],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
