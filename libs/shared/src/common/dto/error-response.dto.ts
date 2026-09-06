import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({ example: 'Resource not found.' })
  message: string;

  @ApiPropertyOptional({ type: [String] })
  details?: string[];

  @ApiProperty({ example: '/api/v1/auth/me' })
  path: string;

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  requestId: string;
}
