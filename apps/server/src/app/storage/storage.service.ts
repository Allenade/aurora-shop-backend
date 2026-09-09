import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import type { EnvTypes } from '@app/shared';
import { CreateUploadUrlDto, UploadUrlResponseDto } from './dto/upload.dto';

export interface FileUploadPayload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService<EnvTypes, true>) {
    const storageConfig = this.config.get('storage', { infer: true });
    const { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl } =
      storageConfig;

    this.bucket = bucket || 'aurorashop090';
    this.publicBaseUrl = (
      publicBaseUrl || 'https://pub-80fb763d2cac40069bedc39977ed512c.r2.dev'
    ).replace(/\/+$/, '');

    if (accountId && accessKeyId && secretAccessKey) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      this.logger.log(
        `Cloudflare R2 Storage initialized for bucket: ${this.bucket}`,
      );
    } else {
      this.logger.warn(
        'Cloudflare R2 credentials are not fully configured. Upload operations will be unavailable.',
      );
    }
  }

  async getPresignedUploadUrl(
    dto: CreateUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    if (!this.s3Client) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 storage is not configured. Please set R2 credentials in environment variables.',
      );
    }

    const folder = (dto.folder || 'products').replace(/^\/+|\/+$/g, '');
    const sanitizedName = this.sanitizeFileName(dto.fileName);
    const uniqueId = randomBytes(6).toString('hex');
    const key = `${folder}/${Date.now()}-${uniqueId}-${sanitizedName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600,
    });
    const publicUrl = `${this.publicBaseUrl}/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key,
    };
  }

  async uploadFile(
    file: FileUploadPayload,
    folder = 'products',
  ): Promise<{ publicUrl: string; key: string }> {
    if (!this.s3Client) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 storage is not configured.',
      );
    }

    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    const sanitizedName = this.sanitizeFileName(file.originalname);
    const uniqueId = randomBytes(6).toString('hex');
    const key = `${cleanFolder}/${Date.now()}-${uniqueId}-${sanitizedName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return {
      publicUrl: `${this.publicBaseUrl}/${key}`,
      key,
    };
  }

  /** Best-effort delete for objects hosted on our public R2 base URL. */
  async deleteByPublicUrl(publicUrl?: string | null): Promise<void> {
    if (!publicUrl || !this.s3Client) return;
    const key = this.keyFromPublicUrl(publicUrl);
    if (!key) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete storage object ${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  keyFromPublicUrl(publicUrl: string): string | null {
    const base = `${this.publicBaseUrl}/`;
    if (!publicUrl.startsWith(base)) return null;
    const key = publicUrl.slice(base.length).replace(/^\/+/, '');
    return key || null;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-');
  }
}
