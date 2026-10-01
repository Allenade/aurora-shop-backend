import { BadRequestException } from '@nestjs/common';
import { magicMatches } from './image-magic';

export { magicMatches } from './image-magic';

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function assertImageFile(file: {
  mimetype: string;
  size: number;
  buffer: Buffer;
}) {
  if (!ALLOWED.has(file.mimetype)) {
    throw new BadRequestException(
      'Only JPEG, PNG, GIF, and WebP images are allowed',
    );
  }
  if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
    throw new BadRequestException('Image exceeds 5MB');
  }
  if (!magicMatches(file.buffer, file.mimetype)) {
    throw new BadRequestException('File content does not match its type');
  }
}

type JimpImage = {
  bitmap: { width: number; height: number };
  scaleToFit(width: number, height: number): JimpImage;
  quality(value: number): JimpImage;
  getBufferAsync(mime: string): Promise<Buffer>;
};

type JimpStatic = {
  read(buffer: Buffer): Promise<JimpImage>;
  MIME_JPEG: string;
};

/** Resize to fit 1600px and recompress JPEG/PNG/GIF. WebP is stored as uploaded. */
export async function compressImage(
  buffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mimetype: string }> {
  if (mime === 'image/webp') return { buffer, mimetype: mime };
  const loaded = (await import('jimp')) as {
    default?: JimpStatic;
  } & JimpStatic;
  const Jimp = loaded.default ?? loaded;
  const image = await Jimp.read(buffer);
  if (image.bitmap.width > 1600 || image.bitmap.height > 1600) {
    image.scaleToFit(1600, 1600);
  }
  image.quality(82);
  const out = await image.getBufferAsync(Jimp.MIME_JPEG);
  return { buffer: out, mimetype: 'image/jpeg' };
}
