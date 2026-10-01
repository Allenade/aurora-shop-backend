import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { EmailKind } from '../email-blocks';

export class EmailContentDto {
  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;

  @IsArray()
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  blocks: unknown[];

  @IsObject()
  @ApiProperty({
    description: 'all | filter | segment | explicit (ids, emails, references)',
  })
  audience: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  @ApiPropertyOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'ISO timestamp to send later' })
  scheduledAt?: string;
}

export class PreviewAudienceDto {
  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;

  @IsObject()
  @ApiProperty()
  audience: Record<string, unknown>;
}

export class SingleEmailDto {
  @IsEmail()
  @MaxLength(180)
  @ApiProperty()
  to: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;

  @IsArray()
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  blocks: unknown[];
}

export class TestEmailDto {
  @IsEmail()
  @MaxLength(180)
  @ApiProperty()
  to: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsArray()
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  blocks: unknown[];
}

export class TemplateDto {
  @IsString()
  @MaxLength(160)
  @ApiProperty()
  name: string;

  @IsString()
  @MaxLength(200)
  @ApiProperty()
  subject: string;

  @IsIn(['transactional', 'marketing'])
  @ApiProperty({ enum: ['transactional', 'marketing'] })
  kind: EmailKind;

  @IsArray()
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  blocks: unknown[];
}

export class SegmentDto {
  @IsString()
  @MaxLength(160)
  @ApiProperty()
  name: string;

  @IsObject()
  @ApiProperty()
  filters: Record<string, unknown>;
}
