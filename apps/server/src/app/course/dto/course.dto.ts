import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AFTER_PAYMENT_EMAIL_MAX_CHARS,
  COURSE_SYLLABUS_TEXT_MAX_CHARS,
} from '../course-media';
import type { CourseStatus } from '../course-pricing';

const STATUSES: CourseStatus[] = ['draft', 'open', 'closed', 'archived'];

export class UpsertCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @ApiProperty({ example: 'iot' })
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @ApiProperty({ example: 'Internet of Things' })
  name: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  @ApiPropertyOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  @ApiPropertyOptional({
    example: 25000,
    nullable: true,
    description:
      'Major units (whole naira). Omit until a price is set from the compliance dashboard. Publishing a paid course without a price returns 400.',
  })
  price?: number | null;

  @IsString()
  @MaxLength(8)
  @IsOptional()
  @ApiPropertyOptional({ example: 'NGN' })
  currency?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isFree?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({ description: 'Null means uncapped' })
  seatCap?: number | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  endDate?: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  enrollmentCutoff?: string | null;

  @IsIn(STATUSES)
  @IsOptional()
  @ApiPropertyOptional({ enum: STATUSES })
  status?: CourseStatus;

  @IsInt()
  @IsOptional()
  @ApiPropertyOptional()
  sortOrder?: number;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  @ApiPropertyOptional()
  cohort?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(AFTER_PAYMENT_EMAIL_MAX_CHARS)
  @IsOptional()
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Sanitized HTML sent after a successful payment, including the joining link. Null or blank clears it. Omitted from public course endpoints.',
  })
  afterPaymentEmail?: string | null;
}

export class UpdateCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  @ApiPropertyOptional()
  name?: string;

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  @ApiPropertyOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  @ApiPropertyOptional({
    example: 25000,
    nullable: true,
    description:
      'Major units (whole naira). Null clears the price on a draft. Publishing a paid course without a price returns 400.',
  })
  price?: number | null;

  @IsString()
  @MaxLength(8)
  @IsOptional()
  @ApiPropertyOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isFree?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  seatCap?: number | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  startDate?: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  endDate?: string | null;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional()
  enrollmentCutoff?: string | null;

  @IsIn(STATUSES)
  @IsOptional()
  @ApiPropertyOptional({ enum: STATUSES })
  status?: CourseStatus;

  @IsInt()
  @IsOptional()
  @ApiPropertyOptional()
  sortOrder?: number;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  @ApiPropertyOptional()
  cohort?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(AFTER_PAYMENT_EMAIL_MAX_CHARS)
  @IsOptional()
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Sanitized HTML sent after a successful payment, including the joining link. Null or blank clears it. Omitted from public course endpoints.',
  })
  afterPaymentEmail?: string | null;
}

export class UpdateCourseSyllabusTextDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(COURSE_SYLLABUS_TEXT_MAX_CHARS)
  @ApiProperty({
    nullable: true,
    description:
      'Sanitized HTML for week-by-week topics. Null or blank clears the text and leaves any PDF in place.',
  })
  text!: string | null;
}

export class ReorderCoursesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'Course ids in display order' })
  ids: string[];
}
