import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { CourseStatus } from '../course-pricing';

const STATUSES: CourseStatus[] = ['draft', 'open', 'closed', 'archived'];

export class UpsertCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @ApiProperty({ example: 'iot' })
  slug: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @ApiProperty({ example: 'Internet of Things' })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  @ApiPropertyOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @ApiProperty({ example: 60000 })
  price: number;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  @ApiPropertyOptional({ example: 'NGN' })
  currency?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isFree?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  seatCap?: number | null;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'ISO-8601 timestamp' })
  startDate?: string | null;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  endDate?: string | null;

  @IsString()
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
  @IsOptional()
  @ApiPropertyOptional({ description: 'When a price change takes effect' })
  effectiveFrom?: string;
}

export class UpdateCourseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsOptional()
  @ApiPropertyOptional()
  slug?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @IsOptional()
  @ApiPropertyOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  @ApiPropertyOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional()
  price?: number;

  @IsString()
  @IsOptional()
  @MaxLength(8)
  @ApiPropertyOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  isFree?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({ nullable: true })
  seatCap?: number | null;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  startDate?: string | null;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  endDate?: string | null;

  @IsString()
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
  @IsOptional()
  @ApiPropertyOptional()
  effectiveFrom?: string;
}

export class ReorderCoursesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ApiProperty({ type: [String] })
  ids: string[];
}

export class CourseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  isFree: boolean;

  @ApiPropertyOptional({ nullable: true })
  seatCap?: number | null;

  @ApiPropertyOptional({ nullable: true })
  seatsTaken?: number;

  @ApiPropertyOptional({ nullable: true })
  startDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  enrollmentCutoff?: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty()
  sortOrder: number;
}
