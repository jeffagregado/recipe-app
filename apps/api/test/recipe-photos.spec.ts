import { describe, expect, it } from 'vitest';
import { describePhoto, jpeg, storedPhoto } from './recipe-photos.js';

describe('Recipe photo fixture', () => {
  it.each([[0, 1, 1], [1, 2, 1], [17, 2, 2], [255, 16, 16]])('jpeg(%i) is a decodable %i by %i JPEG, and storedPhoto(%i) names the same size as WebP', async (marker, width, height) => {
    const bytes = jpeg(marker);
    expect(bytes.length).toBeLessThan(2048);
    expect(await describePhoto(bytes)).toEqual({ format: 'jpeg', width, height });
    expect(storedPhoto(marker)).toEqual({ format: 'webp', width, height });
  });

  it('gives every marker its own bytes and stored identity, and the same bytes on every call', () => {
    const all = Array.from({ length: 256 }, (_, marker) => jpeg(marker).toString('base64'));
    expect(new Set(all).size).toBe(256);
    expect(new Set(Array.from({ length: 256 }, (_, marker) => JSON.stringify(storedPhoto(marker)))).size).toBe(256);
    expect(jpeg(1).equals(jpeg(1))).toBe(true);
    expect(jpeg()).toEqual(jpeg(0));
  });

  it('rejects a marker outside the generated range', () => {
    expect(() => jpeg(256)).toThrow('Photo marker must be an integer from 0 to 255.');
    expect(() => storedPhoto(256)).toThrow('Photo marker must be an integer from 0 to 255.');
  });
});
