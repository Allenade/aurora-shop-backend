import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiProperty({ example: 'Ada' })
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiProperty({ example: 'Okafor' })
  lastName: string;

  @IsEmail()
  @MaxLength(254)
  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiPropertyOptional()
  notes?: string;
}

export class UpdatePersonDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(254)
  @ApiPropertyOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  phone?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  @ApiPropertyOptional()
  notes?: string | null;
}
