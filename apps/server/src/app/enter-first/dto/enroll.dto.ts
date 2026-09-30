import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class EnterFirstEnrollDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Ada' })
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'Okafor' })
  lastName: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  middleName?: string;

  @IsEmail()
  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '+2348012345678' })
  phone: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  stateOfResidence?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  currentStatus?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  institution?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  experienceLevel?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  howDidYouHear?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  joinedCommunity?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ApiProperty({
    type: [String],
    example: ['iot', 'mobile'],
    description: 'Track ids from the Enter First catalogue',
  })
  tracks: string[];
}
