import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShippingAddressDto {
  @ApiProperty({ example: 'Bashirat Bayonuga' })
  @IsString()
  @MaxLength(120)
  fullName: string;

  @ApiProperty({ example: 'bayonuga@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+234 801 234 5678' })
  @IsString()
  @MaxLength(40)
  phone: string;

  @ApiProperty({ example: '14 Admiralty Way, Lekki Phase 1' })
  @IsString()
  @MaxLength(240)
  streetAddress: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MaxLength(80)
  state: string;

  @ApiPropertyOptional({ example: 'Leave with security' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
