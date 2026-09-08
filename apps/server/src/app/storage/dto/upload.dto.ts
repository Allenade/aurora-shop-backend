import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({
    description: 'Original file name',
    example: 'solar-inverter-5kva.png',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'File MIME type', example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiPropertyOptional({
    description: 'Folder path in bucket',
    example: 'products',
    default: 'products',
  })
  @IsString()
  @IsOptional()
  folder?: string;
}

export class UploadUrlResponseDto {
  @ApiProperty({
    description: 'Presigned S3/R2 PUT URL for direct client upload',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'Public HTTPS URL for viewing the uploaded asset',
  })
  publicUrl: string;

  @ApiProperty({
    description: 'Storage key (path) inside the R2 bucket',
  })
  key: string;
}
