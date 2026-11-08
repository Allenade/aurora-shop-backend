import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  InviteOfferType,
  InviteTrackScope,
} from '../entities/enter-first-invite.entity';

const OFFER_TYPES: InviteOfferType[] = [
  'discount_percent',
  'discount_fixed',
  'free',
];
const TRACK_SCOPES: InviteTrackScope[] = ['all', 'selected'];

export class CreateInviteDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  @ApiPropertyOptional()
  label?: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Optional person this invite is for' })
  personId?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({
    description:
      'When personId is set, require enroll email to match. Default true.',
  })
  lockToPerson?: boolean;

  @IsIn(OFFER_TYPES)
  @ApiProperty({ enum: OFFER_TYPES })
  offerType: InviteOfferType;

  @ValidateIf((dto: CreateInviteDto) => dto.offerType === 'discount_percent')
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ description: 'Required for discount_percent' })
  discountPercent?: number;

  @ValidateIf((dto: CreateInviteDto) => dto.offerType === 'discount_fixed')
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ description: 'Required for discount_fixed (naira)' })
  discountAmount?: number;

  @IsIn(TRACK_SCOPES)
  @IsOptional()
  @ApiPropertyOptional({ enum: TRACK_SCOPES, default: 'all' })
  trackScope?: InviteTrackScope;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @ApiPropertyOptional({
    type: [String],
    description: 'Required when trackScope is selected',
  })
  trackSlugs?: string[];

  @IsInt()
  @IsOptional()
  @Min(1)
  @ApiPropertyOptional()
  maxRedemptions?: number;

  @IsISO8601()
  @IsOptional()
  @ApiPropertyOptional()
  expiresAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiPropertyOptional()
  notes?: string;
}

export class UpdateInviteDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  @ApiPropertyOptional()
  label?: string | null;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  active?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  lockToPerson?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  @ApiPropertyOptional()
  maxRedemptions?: number | null;

  @IsISO8601()
  @IsOptional()
  @ApiPropertyOptional()
  expiresAt?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiPropertyOptional()
  notes?: string | null;
}
