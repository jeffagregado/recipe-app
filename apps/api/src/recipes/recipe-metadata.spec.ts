import { describe, expect, it } from 'vitest';
import { matchRecipeFiles } from './recipe-metadata.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngChunk = (name: string) => { const header = Buffer.alloc(8); header.write(name, 4); return Buffer.concat([header, Buffer.alloc(4)]); };
const webpChunk = (name: string) => { const header = Buffer.alloc(8); header.write(name); return header; };
const webp = (...chunks: Buffer[]) => {
  const bytes = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes]);
};
const jpeg = Buffer.from([255, 216, 255, 217]);
const png = Buffer.concat([pngSignature, pngChunk('IDAT')]);
const file = (fieldname: string, mimetype: string, buffer: Buffer) => ({ fieldname, mimetype, buffer });

describe('Recipe file matching', () => {
  it('returns one prepared photo per expected field, in field order, carrying the storage extension and content type', () => {
    const files = [file('step-0', 'image/png', png), file('cover', 'image/jpeg', jpeg), file('step-1', 'image/webp', webp(webpChunk('VP8L')))];
    expect(matchRecipeFiles(['cover', 'step-0', 'step-1'], files)).toEqual([
      { fieldname: 'cover', buffer: jpeg, extension: 'jpg', contentType: 'image/jpeg' },
      { fieldname: 'step-0', buffer: png, extension: 'png', contentType: 'image/png' },
      { fieldname: 'step-1', buffer: files[2].buffer, extension: 'webp', contentType: 'image/webp' },
    ]);
  });

  it.each([
    ['an unexpected field', ['cover'], [file('cover', 'image/jpeg', jpeg), file('step-0', 'image/jpeg', jpeg)], 'step-0'],
    ['a repeated field', ['cover'], [file('cover', 'image/jpeg', jpeg), file('cover', 'image/jpeg', jpeg)], 'cover'],
    ['a missing declared field', ['cover', 'step-0'], [file('cover', 'image/jpeg', jpeg)], 'step-0'],
    // The signature rules themselves are asserted in recipe-images.spec.ts; this proves the matcher surfaces their field error.
    ['a file the image validator refuses', ['cover'], [file('cover', 'image/png', jpeg)], 'cover'],
  ])('rejects %s with a field error on that field', (_, fields, files, field) => {
    expect(() => matchRecipeFiles(fields, files)).toThrowError(expect.objectContaining({ response: expect.objectContaining({ fieldErrors: { [field]: [expect.any(String)] } }) }));
  });
});
