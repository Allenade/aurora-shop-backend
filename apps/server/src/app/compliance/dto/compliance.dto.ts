import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { DataRequestType } from '../entities/data-request.entity';

export class CreateDataRequestDto {
  @IsIn(['access', 'delete'])
  @ApiProperty({ enum: ['access', 'delete'] })
  type: DataRequestType;

  @IsEmail()
  @MaxLength(254)
  @ApiProperty()
  subjectEmail: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  enrollmentId?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  @ApiPropertyOptional()
  notes?: string;
}
