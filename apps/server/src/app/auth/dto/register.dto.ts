import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  lastName: string;

  @IsEmail()
  @ApiProperty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  phone: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  countryCode?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  industry: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  state: string;

  @IsString()
  @MinLength(8)
  @ApiProperty()
  password: string;

  @IsBoolean()
  @ApiProperty()
  agreeToTerms: boolean;
}

export class VerifyOtpDto {
  @IsEmail()
  @ApiProperty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: '123456' })
  code: string;
}

export class ResendOtpDto {
  @IsEmail()
  @ApiProperty()
  email: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @ApiProperty()
  newPassword: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  refreshToken: string;
}
