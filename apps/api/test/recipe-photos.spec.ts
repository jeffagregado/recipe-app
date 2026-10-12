import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { jpeg } from './recipe-photos.js';

describe('Recipe photo fixture', () => {
  it.each([[0, 1, 1], [1, 2, 1], [17, 2, 2], [255, 16, 16]])('jpeg(%i) is a decodable %i by %i JPEG with the marker at byte 6', async (marker, width, height) => {
    const bytes = jpeg(marker);
    expect([bytes[0], bytes[1], bytes[2], bytes[6]]).toEqual([255, 216, 255, marker]);
    expect(bytes.length).toBeLessThan(2048);
    const { format, width: decodedWidth, height: decodedHeight } = await sharp(bytes).metadata();
    expect({ format, width: decodedWidth, height: decodedHeight }).toEqual({ format: 'jpeg', width, height });
  });

  it('gives every marker its own bytes and the same bytes on every call', () => {
    const all = Array.from({ length: 256 }, (_, marker) => jpeg(marker).toString('base64'));
    expect(new Set(all).size).toBe(256);
    expect(jpeg(1).equals(jpeg(1))).toBe(true);
    expect(jpeg()).toEqual(jpeg(0));
  });

  it('rejects a marker outside the generated range', () => {
    expect(() => jpeg(256)).toThrow('Photo marker must be an integer from 0 to 255.');
  });
});
