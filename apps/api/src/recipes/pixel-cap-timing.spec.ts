// [DEBUG-29] Temporary: measures on CI where the pixel-cap boundary test spends its time. Removed by the fix.
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { prepareRecipePhoto } from './recipe-images.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngChunk = (name: string, bytes = Buffer.alloc(0)) => {
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length); header.write(name, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), bytes])));
  return Buffer.concat([header, bytes, crc]);
};
const blankPng = (width: number, height: number) => {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 1;
  return Buffer.concat([pngSignature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.alloc(height * (1 + Math.ceil(width / 8))))), pngChunk('IEND')]);
};
const sharpPng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 30 } } }).png().toBuffer();
const prepare = (buffer: Buffer) => prepareRecipePhoto({ fieldname: 'step-3', mimetype: 'image/png', buffer });
const timed = async <T>(label: string, run: () => T | Promise<T>) => {
  const start = performance.now(); const result = await run();
  console.log(`[DEBUG-29] ${label} ${Math.round(performance.now() - start)} ms`);
  return result;
};

it.each([1, 2, 3])('[DEBUG-29] round %i', async (round) => {
  console.log(`[DEBUG-29] round ${round} sharp.concurrency ${sharp.concurrency()}`);
  const sharpAtCap = await timed('sharp generate 8000x6250', () => sharpPng(8000, 6250));
  const sharpOverCap = await timed('sharp generate 8000x6251', () => sharpPng(8000, 6251));
  await timed('prepare sharp 8000x6250', () => prepare(sharpAtCap));
  await timed('refuse sharp 8000x6251', () => expect(prepare(sharpOverCap)).rejects.toBeDefined());
  const blankAtCap = await timed('hand-built generate 8000x6250', () => blankPng(8000, 6250));
  const blankOverCap = await timed('hand-built generate 8000x6251', () => blankPng(8000, 6251));
  await timed('prepare hand-built 8000x6250', () => prepare(blankAtCap));
  await timed('refuse hand-built 8000x6251', () => expect(prepare(blankOverCap)).rejects.toBeDefined());
}, 60_000);
