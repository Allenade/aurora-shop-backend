import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
import {
  COURSE_LINK_LABEL_LENGTH_MESSAGE,
  COURSE_LINK_LABEL_MAX,
  COURSE_LINK_LABEL_MESSAGE,
  COURSE_LINK_URL_MAX,
  COURSE_LINK_URL_MESSAGE,
  COURSE_LINKS_MAX,
  COURSE_LINKS_MAX_MESSAGE,
  isAbsoluteHttpUrl,
} from '../course-links';
import {
  AFTER_PAYMENT_EMAIL_MAX_CHARS,
  COURSE_SYLLABUS_TEXT_MAX_CHARS,
} from '../course-media';
import type { CourseStatus } from '../course-pricing';

const STATUSES: CourseStatus[] = ['draft', 'open', 'closed', 'archived'];

export class CourseLinkDto {
  @IsCourseLinkLabel()
  @ApiProperty({
    example: 'Course structure',
    maxLength: COURSE_LINK_LABEL_MAX,
  })
  label: string;

  @IsCourseLinkUrl()
  @ApiProperty({
    example: 'https://example.com/structure',
    maxLength: COURSE_LINK_URL_MAX,
  })
  url: string;
}

function IsCourseLinkLabel() {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCourseLinkLabel',
      target: object.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) => linkLabelError(value) == null,
        defaultMessage: (args?: ValidationArguments) =>
          linkLabelError(args?.value) ?? COURSE_LINK_LABEL_MESSAGE,
      },
    });
  };
}

function IsCourseLinkUrl() {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCourseLinkUrl',
      target: object.constructor,
      propertyName,
      validator: {
        validate: (value: unknown) => linkUrlError(value) == null,
        defaultMessage: () => COURSE_LINK_URL_MESSAGE,
      },
    });
  };
}

function linkLabelError(value: unknown): string | null {
  if (typeof value !== 'string') return COURSE_LINK_LABEL_MESSAGE;
  const label = value.trim();
  if (!label) return COURSE_LINK_LABEL_MESSAGE;
  if (label.length > COURSE_LINK_LABEL_MAX) {
    return COURSE_LINK_LABEL_LENGTH_MESSAGE;
  }
  return null;
}

function linkUrlError(value: unknown): string | null {
  if (typeof value !== 'string') return COURSE_LINK_URL_MESSAGE;
  return isAbsoluteHttpUrl(value.trim()) ? null : COURSE_LINK_URL_MESSAGE;
}

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

  @IsOptional()
  @IsArray({ message: COURSE_LINKS_MAX_MESSAGE })
  @ArrayMaxSize(COURSE_LINKS_MAX, { message: COURSE_LINKS_MAX_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => CourseLinkDto)
  @ApiPropertyOptional({
    type: [CourseLinkDto],
    description:
      'Named public links, ordered as saved. The full list replaces any previous links. An empty list clears them.',
  })
  links?: CourseLinkDto[] | null;

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

  @IsOptional()
  @IsArray({ message: COURSE_LINKS_MAX_MESSAGE })
  @ArrayMaxSize(COURSE_LINKS_MAX, { message: COURSE_LINKS_MAX_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => CourseLinkDto)
  @ApiPropertyOptional({
    type: [CourseLinkDto],
    description:
      'Named public links, ordered as saved. The full list replaces any previous links. Omit to leave them unchanged. An empty list clears them.',
  })
  links?: CourseLinkDto[] | null;

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
