import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  @ApiProperty()
  enrollmentId: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  @ApiPropertyOptional()
  reason?: string;
}

export class DecideRefundDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  @ApiPropertyOptional()
  note?: string;
}
