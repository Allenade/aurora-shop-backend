import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isUnder18 } from '../age';

@ValidatorConstraint({ name: 'guardianForMinor', async: false })
export class GuardianForMinorConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const dto = args.object as EnterFirstEnrollDto;
    if (!dto.dateOfBirth || !isUnder18(dto.dateOfBirth)) return true;
    return Boolean(
      dto.guardianName?.trim() &&
      dto.guardianEmail?.trim() &&
      dto.guardianConsent === true,
    );
  }

  defaultMessage() {
    return 'Guardian name, email, and consent are required when the student is under 18';
  }
}

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
  @MaxLength(254)
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
  @MaxLength(40)
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
  @MaxLength(160)
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
  @MaxLength(40, { each: true })
  @ApiProperty({
    type: [String],
    example: ['iot', 'mobile'],
    description: 'Course slugs. Price is taken from the course table.',
  })
  tracks: string[];

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Must be true when sent.' })
  termsAccepted?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  termsVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  @ApiPropertyOptional()
  privacyVersion?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  marketingOptIn?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  ageConfirmed?: boolean;

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
  @MaxLength(254)
  @ApiPropertyOptional()
  guardianEmail?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  guardianConsent?: boolean;

  @ApiHideProperty()
  @Validate(GuardianForMinorConstraint)
  guardianCheck?: string;
}
