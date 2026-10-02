import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { EmailKind } from '../email-queue.policy';
import type { EmailAudience } from '../entities/email.entities';

export class EmailAudienceDto implements EmailAudience {
  @IsIn(['all', 'filter', 'explicit'])
  @ApiProperty({ enum: ['all', 'filter', 'explicit'] })
  kind: 'all' | 'filter' | 'explicit';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  tracks?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  paymentStatuses?: Array<'pending' | 'success' | 'failed' | 'refunded'>;

  @IsInt()
  @Min(1)
  @IsOptional()
  @ApiPropertyOptional({ description: 'Pending longer than N hours' })
  pendingHours?: number;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  @ApiPropertyOptional()
  cohort?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  createdFrom?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  createdTo?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  marketingOptIn?: boolean;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  enrollmentIds?: string[];

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  emails?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  references?: string[];
}

export class UpsertTemplateDto {
  @IsString()
  @MaxLength(80)
  @ApiProperty()
  slug: string;

  @IsString()
  @MaxLength(160)
  @ApiProperty()
  name: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsString()
  @ApiProperty()
  html: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  text?: string;

  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;
}

/** PATCH may send any subset. The service does not rename the slug. */
export class UpdateTemplateDto extends PartialType(UpsertTemplateDto) {}

export class PreviewAudienceDto {
  @ValidateNested()
  @Type(() => EmailAudienceDto)
  @ApiProperty({ type: EmailAudienceDto })
  audience: EmailAudienceDto;

  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;
}

export class SendEmailDto {
  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsString()
  @ApiProperty()
  html: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  text?: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  templateId?: string;

  @ValidateNested()
  @Type(() => EmailAudienceDto)
  @ApiProperty({ type: EmailAudienceDto })
  audience: EmailAudienceDto;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'When true, create a campaign and queue it',
  })
  campaignName?: string;
}

export class TestSendDto {
  @IsEmail()
  @ApiProperty()
  to: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsString()
  @ApiProperty()
  html: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  text?: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  enrollmentId?: string;
}

export class CreateCampaignDto extends SendEmailDto {
  @IsString()
  @MaxLength(160)
  @ApiProperty()
  name: string;
}
