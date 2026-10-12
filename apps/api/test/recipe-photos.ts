import sharp from 'sharp';

const MARKERS = 256;
/** The marker sets the dimensions, so no two markers share bytes and a decoder can still tell them apart after a round trip. */
const size = (marker: number) => ({ width: 1 + (marker % 16), height: 1 + Math.floor(marker / 16) });
const realJpeg = ({ width, height }: ReturnType<typeof size>, marker: number) => sharp({
  create: { width, height, channels: 3, background: { r: marker, g: 255 - marker, b: (marker * 7) % 256 } },
}).jpeg({ quality: 80 }).toBuffer();

/** Every photo a scenario may ask for, generated once per test file so the sync `jpeg()` call sites stay as they are. */
const photos = await Promise.all(Array.from({ length: MARKERS }, (_, marker) => realJpeg(size(marker), marker)));

/** A small real JPEG, decodable by any image library; distinct markers give distinct bytes and dimensions. */
export const jpeg = (marker = 0): Buffer => {
  if (!Number.isInteger(marker) || marker < 0 || marker >= MARKERS) throw new RangeError(`Photo marker must be an integer from 0 to ${MARKERS - 1}.`);
  return Buffer.from(photos[marker]);
};
