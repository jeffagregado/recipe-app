import sharp from 'sharp';

const MARKERS = 256;
/** The marker sets the dimensions, which survive the API's re-encoding, so a scenario can tell which upload a stored photo came from. */
const size = (marker: number) => ({ width: 1 + (marker % 16), height: 1 + Math.floor(marker / 16) });
const realJpeg = (marker: number) => {
  const { width, height } = size(marker);
  return sharp({ create: { width, height, channels: 3, background: { r: marker, g: 255 - marker, b: (marker * 7) % 256 } } }).jpeg({ quality: 80 }).toBuffer();
};
const assertMarker = (marker: number) => {
  if (!Number.isInteger(marker) || marker < 0 || marker >= MARKERS) throw new RangeError(`Photo marker must be an integer from 0 to ${MARKERS - 1}.`);
};

/** Every photo a scenario may ask for, generated once per test file so the sync `jpeg()` call sites stay as they are. */
const photos = await Promise.all(Array.from({ length: MARKERS }, (_, marker) => realJpeg(marker)));

/** A small real JPEG, decodable by any image library; distinct markers give distinct bytes and dimensions. */
export const jpeg = (marker = 0): Buffer => {
  assertMarker(marker);
  return Buffer.from(photos[marker]);
};

/** What `describePhoto` reports for the copy the API stores of `jpeg(marker)`. */
export const storedPhoto = (marker = 0) => {
  assertMarker(marker);
  return { format: 'webp', ...size(marker) };
};

/** The decoded identity of image bytes: the format and dimensions a re-encoded photo is recognised by. */
export const describePhoto = async (bytes: Uint8Array) => {
  const { format, width, height } = await sharp(bytes).metadata();
  return { format, width, height };
};
