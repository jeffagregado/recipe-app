import sharp from 'sharp';

const MARKERS = 256;
/** The marker sets the dimensions, so a decoder can still tell two photos apart after a round trip. */
const size = (marker: number) => ({ width: 1 + (marker % 16), height: 1 + Math.floor(marker / 16) });
/** A JPEG comment segment carrying the marker, placed right after the start-of-image marker so the marker stays at byte 6,
 * where the update-recipe scenarios read it back from a stored object.
 */
const comment = (marker: number) => Buffer.from([255, 254, 0, 3, marker]);
const realJpeg = async (marker: number) => {
  const { width, height } = size(marker);
  const encoded = await sharp({ create: { width, height, channels: 3, background: { r: marker, g: 255 - marker, b: (marker * 7) % 256 } } })
    .jpeg({ quality: 80 }).toBuffer();
  return Buffer.concat([encoded.subarray(0, 2), comment(marker), encoded.subarray(2)]);
};

/** Every photo a scenario may ask for, generated once per test file so the sync `jpeg()` call sites stay as they are. */
const photos = await Promise.all(Array.from({ length: MARKERS }, (_, marker) => realJpeg(marker)));

/** A small real JPEG, decodable by any image library; distinct markers give distinct bytes, byte 6 and dimensions. */
export const jpeg = (marker = 0): Buffer => {
  if (!Number.isInteger(marker) || marker < 0 || marker >= MARKERS) throw new RangeError(`Photo marker must be an integer from 0 to ${MARKERS - 1}.`);
  return Buffer.from(photos[marker]);
};
