export function magicMatches(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (mime === 'image/png') {
    return buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG';
  }
  if (mime === 'image/gif') return buffer.toString('ascii', 0, 3) === 'GIF';
  if (mime === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}
