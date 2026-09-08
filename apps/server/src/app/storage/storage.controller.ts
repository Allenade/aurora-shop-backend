import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Action, Resource } from '@app/shared';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUploadUrlDto, UploadUrlResponseDto } from './dto/upload.dto';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload-url')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PRODUCT })
  @ApiOperation({
    operationId: 'getStorageUploadUrl',
    summary: 'Get Presigned Upload URL',
    description:
      'Generate a presigned S3/R2 PUT URL for direct browser uploads. The client uploads directly to Cloudflare R2 and uses the returned publicUrl.',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned upload URL generated successfully.',
    type: UploadUrlResponseDto,
  })
  getUploadUrl(@Body() dto: CreateUploadUrlDto): Promise<UploadUrlResponseDto> {
    return this.storageService.getPresignedUploadUrl(dto);
  }

  @Post('upload')
  @RequirePermissions({ action: Action.MANAGE, resource: Resource.PRODUCT })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    operationId: 'uploadStorageFile',
    summary: 'Upload File Directly',
    description: 'Direct multipart file upload to Cloudflare R2.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadFile(
    @UploadedFile()
    file?: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<{ publicUrl: string; key: string }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.storageService.uploadFile(file);
  }
}
