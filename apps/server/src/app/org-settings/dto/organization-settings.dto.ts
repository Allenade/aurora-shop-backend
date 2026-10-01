import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateOrganizationSettingsDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  @ApiPropertyOptional()
  retentionAbandonedDays?: number;

  @IsInt()
  @Min(1)
  @Max(36500)
  @IsOptional()
  @ApiPropertyOptional()
  retentionPaidDays?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  @ApiPropertyOptional()
  legalEntityName?: string;

  @IsString()
  @MaxLength(40)
  @IsOptional()
  @ApiPropertyOptional()
  rcNumber?: string;

  @IsString()
  @MaxLength(40)
  @IsOptional()
  @ApiPropertyOptional()
  taxId?: string;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  @ApiPropertyOptional()
  termsVersion?: string;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  @ApiPropertyOptional()
  privacyVersion?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiPropertyOptional()
  termsUrl?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiPropertyOptional()
  privacyUrl?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiPropertyOptional()
  marketingPolicyUrl?: string;
}
