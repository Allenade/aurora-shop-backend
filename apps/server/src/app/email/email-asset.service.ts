import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service';

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ATTACHMENT_TYPES = new Set([
  ...IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'text/csv',
]);

@Injectable()
export class EmailAssetService {
  constructor(private readonly storage: StorageService) {}

  async uploadImage(file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    if (!file?.buffer?.length)
      throw new BadRequestException('File is required');
    if (!IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Image must be jpeg, png, webp, or gif');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image exceeds 5MB');
    }
    const compressed = await this.compress(file);
    return this.storage.uploadFile(compressed, 'emails');
  }

  async uploadAttachment(file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    if (!file?.buffer?.length)
      throw new BadRequestException('File is required');
    if (!ATTACHMENT_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported attachment type');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Attachment exceeds 10MB');
    }
    const payload = IMAGE_TYPES.has(file.mimetype)
      ? await this.compress(file)
      : file;
    const uploaded = await this.storage.uploadFile(
      payload,
      'emails/attachments',
    );
    return {
      ...uploaded,
      filename: file.originalname,
      contentType: payload.mimetype,
    };
  }

  private async compress(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }) {
    let pipeline = sharp(file.buffer, {
      animated: file.mimetype === 'image/gif',
      failOn: 'none',
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      });
    let mimetype = file.mimetype;
    let name = file.originalname;
    if (file.mimetype === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else if (file.mimetype === 'image/webp') {
      pipeline = pipeline.webp({ quality: 80 });
    } else if (file.mimetype === 'image/gif') {
      pipeline = pipeline.gif();
    } else {
      pipeline = pipeline.jpeg({ quality: 80 });
      mimetype = 'image/jpeg';
      name = name.replace(/\.\w+$/, '') + '.jpg';
    }
    const buffer = await pipeline.toBuffer();
    return { buffer, originalname: name, mimetype, size: buffer.length };
  }
}
