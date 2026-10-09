import { describe, expect, it } from 'vitest';
import { validateRecipeImage } from './recipe-images.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngChunk = (name: string, bytes = Buffer.alloc(0)) => {
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length); header.write(name, 4);
  return Buffer.concat([header, bytes, Buffer.alloc(4)]);
};
const webpChunk = (name: string, bytes = Buffer.alloc(0)) => {
  const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, Buffer.alloc(bytes.length % 2)]);
};
const webp = (...chunks: Buffer[]) => {
  const bytes = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes]);
};
const check = (buffer: Buffer, mimetype: string) => validateRecipeImage({ fieldname: 'cover', mimetype, buffer });

describe('Recipe image inspection', () => {
  it('accepts JPEG, static PNG and static WebP signatures', () => {
    expect(check(Buffer.from([255, 216, 255]), 'image/jpeg')).toBe('jpg');
    expect(check(Buffer.concat([pngSignature, pngChunk('IDAT')]), 'image/png')).toBe('png');
    expect(check(webp(webpChunk('VP8 ', Buffer.from('acTL ANIM ANMF'))), 'image/webp')).toBe('webp');
  });
  it('rejects empty, oversized, unsupported and mismatched images', () => {
    for (const [buffer, mime] of [[Buffer.alloc(0), 'image/png'], [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'],
      [Buffer.from('GIF89a'), 'image/gif'], [Buffer.from('<svg/>'), 'image/svg+xml'],
      [Buffer.from([255, 216, 255]), 'image/png']] as const) expect(() => check(buffer, mime)).toThrow();
  });
  it('walks PNG boundaries, rejects acTL before IDAT and truncated lengths', () => {
    expect(() => check(Buffer.concat([pngSignature, pngChunk('acTL'), pngChunk('IDAT')]), 'image/png')).toThrow();
    expect(check(Buffer.concat([pngSignature, pngChunk('tEXt', Buffer.from('acTL')), pngChunk('IDAT')]), 'image/png')).toBe('png');
    const bad = pngChunk('tEXt'); bad.writeUInt32BE(500);
    expect(() => check(Buffer.concat([pngSignature, bad]), 'image/png')).toThrow();
    expect(() => check(pngSignature, 'image/png')).toThrow();
  });
  it('rejects animation and truncated trailing chunks after PNG image data', () => {
    expect(() => check(Buffer.concat([pngSignature, pngChunk('IDAT'), pngChunk('acTL')]), 'image/png')).toThrow();
    expect(() => check(Buffer.concat([pngSignature, pngChunk('IDAT'), Buffer.from('trailing')]), 'image/png')).toThrow();
  });
  it('walks RIFF boundaries, rejects animation flags/chunks and truncated lengths', () => {
    for (const chunk of [webpChunk('VP8X', Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])), webpChunk('ANIM'), webpChunk('ANMF')]) {
      expect(() => check(webp(chunk), 'image/webp')).toThrow();
    }
    const bad = webpChunk('VP8 '); bad.writeUInt32LE(500, 4);
    expect(() => check(webp(bad), 'image/webp')).toThrow();
    const badRiff = webp(webpChunk('VP8 ')); badRiff.writeUInt32LE(500, 4);
    expect(() => check(badRiff, 'image/webp')).toThrow();
    expect(() => check(webp(webpChunk('VP8X', Buffer.from([0]))), 'image/webp')).toThrow();
  });
});
