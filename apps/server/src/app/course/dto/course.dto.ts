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
} from 'class-validator';
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
  @ApiProperty({ example: 60000, description: 'Major units, e.g. whole naira' })
  price: number;

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
  @ApiPropertyOptional()
  price?: number;

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
}

export class ReorderCoursesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ type: [String], description: 'Course ids in display order' })
  ids: string[];
}
