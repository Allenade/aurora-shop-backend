import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDataRequestDto {
  @IsIn(['access', 'delete'])
  @ApiProperty({ enum: ['access', 'delete'] })
  type: 'access' | 'delete';

  @IsEmail()
  @MaxLength(180)
  @ApiProperty()
  subjectEmail: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  enrollmentId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;
}
