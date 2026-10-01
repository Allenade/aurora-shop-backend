import { magicMatches } from './image-magic';

describe('magicMatches', () => {
  it('recognises JPEG and rejects a mismatched PNG header', () => {
    const jpeg = Buffer.alloc(16);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    expect(magicMatches(jpeg, 'image/jpeg')).toBe(true);
    expect(magicMatches(jpeg, 'image/png')).toBe(false);
  });
});
