import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  @ApiProperty()
  enrollmentId: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @ApiPropertyOptional({
    description: 'Whole naira. Defaults to the amount charged.',
  })
  amount?: number;

  @IsString()
  @MaxLength(500)
  @ApiProperty()
  reason: string;
}

export class ReviewRefundDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  @ApiPropertyOptional()
  note?: string;
}
