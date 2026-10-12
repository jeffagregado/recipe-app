import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { matchRecipeFiles, recipeRequestHash } from './recipe-metadata.js';

const canvas = (width: number) => sharp({ create: { width, height: 1, channels: 3, background: { r: 10, g: 200, b: 30 } } });
const jpeg = await canvas(1).jpeg().toBuffer();
const png = await canvas(2).png().toBuffer();
const webp = await canvas(3).webp().toBuffer();
const file = (fieldname: string, mimetype: string, buffer: Buffer) => ({ fieldname, mimetype, buffer });
const untimed = () => {};
const storedWidth = async (bytes: Buffer) => { const { format, width } = await sharp(bytes).metadata(); return { format, width }; };

describe('Recipe file matching', () => {
  it('returns one prepared photo per expected field, in field order, each re-encoded for a .webp key and carrying its upload', async () => {
    const photos = await matchRecipeFiles(['cover', 'step-0', 'step-1'], [file('step-0', 'image/png', png), file('cover', 'image/jpeg', jpeg), file('step-1', 'image/webp', webp)], untimed);
    expect(photos.map((photo) => ({ ...photo, buffer: undefined }))).toEqual([
      { fieldname: 'cover', buffer: undefined, extension: 'webp', contentType: 'image/webp', uploaded: jpeg },
      { fieldname: 'step-0', buffer: undefined, extension: 'webp', contentType: 'image/webp', uploaded: png },
      { fieldname: 'step-1', buffer: undefined, extension: 'webp', contentType: 'image/webp', uploaded: webp },
    ]);
    expect(await Promise.all(photos.map((photo) => storedWidth(photo.buffer)))).toEqual([{ format: 'webp', width: 1 }, { format: 'webp', width: 2 }, { format: 'webp', width: 3 }]);
  });

  it.each([
    ['an unexpected field', ['cover'], [file('cover', 'image/jpeg', jpeg), file('step-0', 'image/jpeg', jpeg)], 'step-0'],
    ['a repeated field', ['cover'], [file('cover', 'image/jpeg', jpeg), file('cover', 'image/jpeg', jpeg)], 'cover'],
    ['a missing declared field', ['cover', 'step-0'], [file('cover', 'image/jpeg', jpeg)], 'step-0'],
    // The image rules themselves are asserted in recipe-images.spec.ts; this proves the matcher surfaces their field error.
    ['a file the image module refuses', ['cover', 'step-0'], [file('cover', 'image/jpeg', jpeg), file('step-0', 'image/png', jpeg)], 'step-0'],
  ])('rejects %s with a field error on that field', async (_, fields, files, field) => {
    await expect(matchRecipeFiles(fields, files, untimed)).rejects.toEqual(expect.objectContaining({ response: expect.objectContaining({ fieldErrors: { [field]: [expect.any(String)] } }) }));
  });

  it('checks the write deadline before each photo and prepares none after it has passed', async () => {
    const timedOut = new Error('deadline'); let checks = 0;
    const checkDeadline = () => { if (++checks === 2) throw timedOut; };
    // The third file is not an image: reaching it would reject with a field error instead of the deadline.
    const files = [file('cover', 'image/jpeg', jpeg), file('step-0', 'image/png', png), file('step-1', 'image/png', jpeg)];
    await expect(matchRecipeFiles(['cover', 'step-0', 'step-1'], files, checkDeadline)).rejects.toBe(timedOut);
    expect(checks).toBe(2);
  });
});

describe('Recipe request hash', () => {
  it('covers the uploaded bytes, unchanged by re-encoding, so two uploads that re-encode alike still hash apart', async () => {
    const metadata = { title: 'Soup', description: null, categoryIds: [], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
      ingredients: [{ name: 'Salt', quantity: null, unit: null }], instructions: [{ description: 'Mix.', hasImage: false }] };
    // The value the same request hashed to while photos were stored as uploaded, so a retry across the change still replays.
    expect(recipeRequestHash(metadata, [{ fieldname: 'cover', uploaded: Buffer.from('uploaded cover') }, { fieldname: 'step-0', uploaded: Buffer.from('uploaded step') }]))
      .toBe('92cf03da33e0709cf6760ee26ec3ea75b0a7a7a20265b712929d7c52a8e54bd4');
    const tagged = await canvas(1).withExif({ IFD0: { Copyright: 'Owner' } }).jpeg().toBuffer();
    const [plain] = await matchRecipeFiles(['cover'], [file('cover', 'image/jpeg', jpeg)], untimed);
    const [other] = await matchRecipeFiles(['cover'], [file('cover', 'image/jpeg', tagged)], untimed);
    expect(other.buffer.equals(plain.buffer)).toBe(true);
    expect(recipeRequestHash(metadata, [other])).not.toBe(recipeRequestHash(metadata, [plain]));
  });
});
