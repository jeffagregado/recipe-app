import sharp from 'sharp';
import { RECIPE_IMAGE_MIME_TYPES, RECIPE_LIMITS } from '@recipe-app/contracts/types';
import { fieldError } from './recipe-errors.js';

export type RecipeFile = { fieldname: string; mimetype: string; buffer: Buffer };
/** An accepted upload as storage receives it: the re-encoded bytes to store, the extension of their object key and the content type
 * they are served with. The file as it arrived is never stored.
 */
export type PreparedPhoto = { buffer: Buffer; extension: 'webp'; contentType: 'image/webp' };
/** Declared pixels above this are refused from the header, before any pixel is decoded. */
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_STORED_EDGE = 2048;
const STORED_QUALITY = 80;
export const IMAGE_TOO_LARGE = `Image exceeds ${RECIPE_LIMITS.imageBytes / (1024 * 1024)} MiB.`;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
type InvalidImage = (message: string) => never;

/** PNG includes a CRC; RIFF pads odd-sized chunks. Both lengths are checked before reading chunk payload. */
function* imageChunks(buffer: Buffer, offset: number, format: 'PNG' | 'WebP', invalid: InvalidImage) {
  const png = format === 'PNG'; const overhead = png ? 12 : 8;
  while (offset + overhead <= buffer.length) {
    const length = png ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset + 4);
    const end = offset + overhead + length + (png ? 0 : length % 2);
    if (end > buffer.length) invalid(`${format} chunk length is invalid.`);
    const typeStart = offset + (png ? 4 : 0);
    yield { type: buffer.toString('ascii', typeStart, typeStart + 4), start: offset + 8, length };
    offset = end;
  }
  if (offset !== buffer.length) invalid(`${format} chunk is truncated.`);
}

function validatePng(buffer: Buffer, invalid: InvalidImage): void {
  if (!buffer.subarray(0, 8).equals(pngSignature)) invalid('Image bytes do not match PNG.');
  let image = false;
  for (const chunk of imageChunks(buffer, 8, 'PNG', invalid)) {
    if (chunk.type === 'acTL') invalid('Animated PNG is not supported.');
    if (chunk.type === 'IDAT') image = true;
  }
  if (!image) invalid('PNG has no image data.');
}

function checkWebpChunk(buffer: Buffer, chunk: { type: string; start: number; length: number }, invalid: InvalidImage): void {
  if (chunk.type === 'ANIM' || chunk.type === 'ANMF') invalid('Animated WebP is not supported.');
  if (chunk.type !== 'VP8X') return;
  if (chunk.length !== 10) invalid('WebP extended header is invalid.');
  if ((buffer[chunk.start] & 2) !== 0) invalid('Animated WebP is not supported.');
}

function validateWebp(buffer: Buffer, invalid: InvalidImage): void {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') invalid('Image bytes do not match WebP.');
  if (buffer.readUInt32LE(4) + 8 !== buffer.length) invalid('WebP RIFF length is invalid.');
  let image = false;
  for (const chunk of imageChunks(buffer, 12, 'WebP', invalid)) {
    checkWebpChunk(buffer, chunk, invalid);
    if (chunk.type === 'VP8 ' || chunk.type === 'VP8L') image = true;
  }
  if (!image) invalid('WebP has no image data.');
}

function validateJpeg(buffer: Buffer, invalid: InvalidImage): void {
  if (buffer.length < 3 || buffer[0] !== 255 || buffer[1] !== 216 || buffer[2] !== 255) invalid('Image bytes do not match JPEG.');
}

const signatureChecks: Record<(typeof RECIPE_IMAGE_MIME_TYPES)[number], (buffer: Buffer, invalid: InvalidImage) => void> = {
  'image/jpeg': validateJpeg, 'image/png': validatePng, 'image/webp': validateWebp,
};

/** Inspects chunk boundaries, not payload substrings; never trusts filenames. Runs before any pixel is decoded. */
function validateRecipeImage({ fieldname, mimetype, buffer }: RecipeFile): void {
  const invalid = (message: string): never => { throw fieldError(fieldname, message); };
  if (!buffer.length) invalid('Image must not be empty.');
  if (buffer.length > RECIPE_LIMITS.imageBytes) throw fieldError(fieldname, IMAGE_TOO_LARGE, 413, 'PAYLOAD_TOO_LARGE');
  const accepted = RECIPE_IMAGE_MIME_TYPES.find((mime) => mime === mimetype);
  if (!accepted) throw fieldError(fieldname, 'Use JPEG, PNG or static WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  signatureChecks[accepted](buffer, invalid);
}

/** Validates one upload, then decodes it and returns the copy that is stored in its place: upright, opaque on white, at most
 * 2048 px on its long edge, WebP, no metadata. Every photo takes this path, so nothing is ever stored as uploaded.
 */
export async function prepareRecipePhoto(file: RecipeFile): Promise<PreparedPhoto> {
  validateRecipeImage(file);
  let buffer: Buffer;
  try {
    buffer = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).autoOrient().flatten({ background: '#ffffff' })
      .resize({ width: MAX_STORED_EDGE, height: MAX_STORED_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: STORED_QUALITY }).toBuffer();
  } catch { throw fieldError(file.fieldname, 'Photo could not be decoded.'); }
  return { buffer, extension: 'webp', contentType: 'image/webp' };
}
