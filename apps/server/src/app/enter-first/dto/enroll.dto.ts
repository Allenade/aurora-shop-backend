import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class EnterFirstEnrollDto {
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

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  middleName?: string;

  @IsEmail()
  @MaxLength(180)
  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @ApiProperty({ example: '+2348012345678' })
  phone: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  stateOfResidence?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  currentStatus?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  @ApiPropertyOptional()
  institution?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  @ApiPropertyOptional()
  experienceLevel?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiPropertyOptional()
  howDidYouHear?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  @ApiPropertyOptional()
  joinedCommunity?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @ApiProperty({
    type: [String],
    example: ['iot', 'mobile'],
    description: 'Course slugs from GET /enter-first/courses',
  })
  tracks: string[];

  @IsBoolean()
  @Equals(true)
  @ApiProperty({
    description: 'Must be true. Records consent to the terms version.',
  })
  termsAccepted: boolean;

  @IsBoolean()
  @Equals(true)
  @ApiProperty({
    description: 'Must be true. Records consent to the privacy version.',
  })
  privacyAccepted: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  @ApiPropertyOptional({
    description: 'Defaults to the current settings version',
  })
  termsVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  @ApiPropertyOptional()
  privacyVersion?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  marketingOptIn?: boolean;

  @IsBoolean()
  @Equals(true)
  @ApiProperty({ description: 'Enrollee confirms they are allowed to enroll.' })
  ageConfirmed: boolean;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiPropertyOptional({ example: '2008-04-12' })
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiPropertyOptional()
  guardianName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(180)
  @ApiPropertyOptional()
  guardianEmail?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  guardianConsent?: boolean;
}
