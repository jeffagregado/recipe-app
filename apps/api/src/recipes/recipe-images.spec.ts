import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareRecipePhoto } from './recipe-images.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngChunk = (name: string, bytes = Buffer.alloc(0)) => {
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length); header.write(name, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), bytes])));
  return Buffer.concat([header, bytes, crc]);
};
/** A valid all-black 1-bit greyscale PNG. Its rows are zero bytes that deflate to a few kilobytes, so a 50-megapixel one is built in tens of
 * milliseconds; encoding one with sharp took 0.7 to 1.4 s on CI (#29).
 */
const blankPng = (width: number, height: number) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 1;
  const rows = Buffer.alloc(height * (1 + Math.ceil(width / 8)));
  return Buffer.concat([pngSignature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND')]);
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
const mimes = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
type Format = keyof typeof mimes;
const canvas = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 30 } } });
const image = (format: Format, width = 100, height = 80) => canvas(width, height).toFormat(format).toBuffer();
const prepare = (buffer: Buffer, mimetype: string) => prepareRecipePhoto({ fieldname: 'step-3', mimetype, buffer });
const described = async (bytes: Buffer) => {
  const { format, width, height, orientation, exif, icc, xmp, hasAlpha } = await sharp(bytes).metadata();
  return { format, width, height, orientation, exif, icc, xmp, hasAlpha };
};
const bare = { orientation: undefined, exif: undefined, icc: undefined, xmp: undefined, hasAlpha: false };
const rejection = (message: string, status = 400, code = 'VALIDATION_FAILED') =>
  expect.objectContaining({ status, response: { code, message, fieldErrors: { 'step-3': [message] } } });

describe('Recipe photo preparation', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('stores a 100 by 80 %s as a 100 by 80 WebP under a .webp key, keeping the uploaded bytes for the request hash', async (format) => {
    const uploaded = await image(format);
    const photo = await prepare(uploaded, mimes[format]);
    expect({ ...photo, buffer: undefined }).toEqual({ fieldname: 'step-3', buffer: undefined, extension: 'webp', contentType: 'image/webp', uploaded });
    expect(await described(photo.buffer)).toEqual({ ...bare, format: 'webp', width: 100, height: 80 });
  });

  it.each([[4000, 3000, 2048, 1536], [1000, 3000, 683, 2048], [2048, 2048, 2048, 2048]])('fits a %i by %i photo inside 2048 by 2048 as %i by %i', async (width, height, storedWidth, storedHeight) => {
    const photo = await prepare(await image('jpeg', width, height), 'image/jpeg');
    expect(await described(photo.buffer)).toEqual({ ...bare, format: 'webp', width: storedWidth, height: storedHeight });
  });

  it('turns an EXIF orientation 6 photo upright and drops its EXIF and ICC metadata', async () => {
    const sideways = await canvas(100, 80).withExif({ IFD0: { Copyright: 'Owner' } }).withMetadata({ orientation: 6 }).withIccProfile('p3').jpeg().toBuffer();
    expect(await described(sideways)).toEqual(expect.objectContaining({ width: 100, height: 80, orientation: 6, exif: expect.any(Buffer), icc: expect.any(Buffer) }));
    expect(await described((await prepare(sideways, 'image/jpeg')).buffer)).toEqual({ ...bare, format: 'webp', width: 80, height: 100 });
  });

  it('re-encodes a small WebP that carries EXIF instead of storing it as uploaded', async () => {
    const tagged = await canvas(100, 80).withExif({ IFD0: { Copyright: 'Owner' } }).webp().toBuffer();
    expect((await described(tagged)).exif).toEqual(expect.any(Buffer));
    expect(await described((await prepare(tagged, 'image/webp')).buffer)).toEqual({ ...bare, format: 'webp', width: 100, height: 80 });
  });

  it('flattens a transparent PNG onto white', async () => {
    const transparent = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { data, info } = await sharp((await prepare(transparent, 'image/png')).buffer).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...data]).toEqual(Array.from({ length: 4 * 4 * 3 }, () => 255));
  });

  it('accepts a valid PNG declaring exactly 50,000,000 pixels and refuses one declaring a row more', async () => {
    expect(await described((await prepare(blankPng(8000, 6250), 'image/png')).buffer)).toEqual({ ...bare, format: 'webp', width: 2048, height: 1600 });
    await expect(prepare(blankPng(8000, 6251), 'image/png')).rejects.toEqual(rejection('Photo could not be decoded.'));
  });

  it('rejects a truncated JPEG on its own field', async () => {
    const whole = await image('jpeg');
    await expect(prepare(whole.subarray(0, whole.length / 2), 'image/jpeg')).rejects.toEqual(rejection('Photo could not be decoded.'));
  });

  it.each([
    ['an empty file', Buffer.alloc(0), 'image/png', rejection('Image must not be empty.')],
    ['a file over 4 MiB', Buffer.alloc(4 * 1024 * 1024 + 1), 'image/jpeg', rejection('Image exceeds 4 MiB.', 413, 'PAYLOAD_TOO_LARGE')],
    ['a GIF', Buffer.from('GIF89a'), 'image/gif', rejection('Use JPEG, PNG or static WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE')],
    ['an SVG', Buffer.from('<svg/>'), 'image/svg+xml', rejection('Use JPEG, PNG or static WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE')],
    ['JPEG bytes declared as PNG', Buffer.from([255, 216, 255]), 'image/png', rejection('Image bytes do not match PNG.')],
    ['PNG bytes declared as JPEG', pngSignature, 'image/jpeg', rejection('Image bytes do not match JPEG.')],
    ['PNG bytes declared as WebP', pngSignature, 'image/webp', rejection('Image bytes do not match WebP.')],
    ['a PNG animated before its image data', Buffer.concat([pngSignature, pngChunk('acTL'), pngChunk('IDAT')]), 'image/png', rejection('Animated PNG is not supported.')],
    ['a PNG animated after its image data', Buffer.concat([pngSignature, pngChunk('IDAT'), pngChunk('acTL')]), 'image/png', rejection('Animated PNG is not supported.')],
    ['a PNG chunk longer than the file', Buffer.concat([pngSignature, pngChunk('tEXt').fill(1, 2, 4)]), 'image/png', rejection('PNG chunk length is invalid.')],
    ['a PNG with trailing bytes', Buffer.concat([pngSignature, pngChunk('IDAT'), Buffer.from('trailing')]), 'image/png', rejection('PNG chunk is truncated.')],
    ['a PNG without image data', pngSignature, 'image/png', rejection('PNG has no image data.')],
    ['a WebP with the animation flag', webp(webpChunk('VP8X', Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]))), 'image/webp', rejection('Animated WebP is not supported.')],
    ['a WebP with an ANIM chunk', webp(webpChunk('ANIM')), 'image/webp', rejection('Animated WebP is not supported.')],
    ['a WebP with an ANMF chunk', webp(webpChunk('ANMF')), 'image/webp', rejection('Animated WebP is not supported.')],
    ['a WebP chunk longer than the file', webp(webpChunk('VP8 ').fill(1, 5, 7)), 'image/webp', rejection('WebP chunk length is invalid.')],
    ['a WebP whose RIFF length is wrong', webp(webpChunk('VP8 ')).fill(1, 5, 7), 'image/webp', rejection('WebP RIFF length is invalid.')],
    ['a WebP with a short extended header', webp(webpChunk('VP8X', Buffer.from([0]))), 'image/webp', rejection('WebP extended header is invalid.')],
    ['a WebP without image data', webp(webpChunk('EXIF')), 'image/webp', rejection('WebP has no image data.')],
  ])('rejects %s before decoding', async (_, buffer, mimetype, expected) => {
    await expect(prepare(buffer, mimetype)).rejects.toEqual(expected);
  });

  it('reads animation chunk names only at chunk boundaries, not inside payloads', async () => {
    const png = await image('png', 5, 5); const header = 8 + 25;
    const commented = Buffer.concat([png.subarray(0, header), pngChunk('tEXt', Buffer.from('Comment\0acTL')), png.subarray(header)]);
    expect(await described((await prepare(commented, 'image/png')).buffer)).toEqual({ ...bare, format: 'webp', width: 5, height: 5 });
    const still = await image('webp', 5, 5);
    const padded = Buffer.concat([still, webpChunk('XTRA', Buffer.from('acTL ANIM ANMF'))]); padded.writeUInt32LE(padded.length - 8, 4);
    expect(await described((await prepare(padded, 'image/webp')).buffer)).toEqual({ ...bare, format: 'webp', width: 5, height: 5 });
  });
});
