/**
 * Minimal image headers assembled byte by byte, so the repository carries no binary
 * files. They are valid for header reading only, not for decoding.
 */

function pad(bytes: number[], size?: number): Uint8Array {
  const out = new Uint8Array(Math.max(size ?? 0, bytes.length));
  out.set(bytes);
  return out;
}

const u32be = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];
const u24le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
];
const ascii = (text: string): number[] =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG: signature + `IHDR` chunk. `size` pads the file with zeros. */
export function png(width: number, height: number, size?: number): Uint8Array {
  return pad(
    [
      ...PNG_SIGNATURE,
      ...u32be(13),
      ...ascii("IHDR"),
      ...u32be(width),
      ...u32be(height),
      8, // bit depth
      6, // color type
      0,
      0,
      0,
      0,
      0,
      0,
      0, // CRC placeholder
    ],
    size,
  );
}

/** PNG with only the signature (truncated before `IHDR`). */
export function pngSignatureOnly(): Uint8Array {
  return new Uint8Array(PNG_SIGNATURE);
}

/** PNG whose `IHDR` stops before the height. */
export function pngShortHeader(): Uint8Array {
  return new Uint8Array([
    ...PNG_SIGNATURE,
    ...u32be(13),
    ...ascii("IHDR"),
    ...u32be(100),
  ]);
}

interface JpegOptions {
  progressive?: boolean;
  /** Adds an APP1 (EXIF) segment before the frame header. */
  exif?: boolean;
  size?: number;
}

/** JPEG: SOI, APP0, optional APP1 and a `SOF0`/`SOF2` frame header. */
export function jpeg(
  width: number,
  height: number,
  options: JpegOptions = {},
): Uint8Array {
  const app0 = [
    0xff,
    0xe0,
    ...u16be(16),
    ...ascii("JFIF"),
    0,
    1,
    1,
    0,
    ...u16be(1),
    ...u16be(1),
    0,
    0,
  ];
  const exifBody = [...ascii("Exif"), 0, 0, ...new Array<number>(20).fill(7)];
  const app1 =
    options.exif === true
      ? [0xff, 0xe1, ...u16be(exifBody.length + 2), ...exifBody]
      : [];
  const sof = [
    0xff,
    options.progressive === true ? 0xc2 : 0xc0,
    ...u16be(17),
    8, // precision
    ...u16be(height),
    ...u16be(width),
    3, // components
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  return pad([0xff, 0xd8, ...app0, ...app1, ...sof, 0xff, 0xd9], options.size);
}

/** JPEG with only the start-of-image marker. */
export function jpegSoiOnly(): Uint8Array {
  return new Uint8Array([0xff, 0xd8]);
}

/** JPEG that never reaches a frame header (only a DHT segment, which is not a SOF). */
export function jpegWithoutFrame(): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc4,
    ...u16be(4),
    0,
    0,
    0xff,
    0xd9,
  ]);
}

function riff(chunk: number[]): number[] {
  return [
    ...ascii("RIFF"),
    ...u32le(chunk.length + 4),
    ...ascii("WEBP"),
    ...chunk,
  ];
}

/** WebP lossy (`VP8 `). */
export function webpLossy(
  width: number,
  height: number,
  size?: number,
): Uint8Array {
  return pad(
    riff([
      ...ascii("VP8 "),
      ...u32le(10),
      0x30,
      0x01,
      0x00, // frame tag
      0x9d,
      0x01,
      0x2a, // start code
      ...u16le(width),
      ...u16le(height),
    ]),
    size,
  );
}

/** WebP lossless (`VP8L`): 14 bits of width-1, 14 bits of height-1. */
export function webpLossless(
  width: number,
  height: number,
  size?: number,
): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return pad(
    riff([...ascii("VP8L"), ...u32le(5), 0x2f, ...u32le(bits >>> 0)]),
    size,
  );
}

/** WebP extended (`VP8X`): 24 bits of canvas width-1 and height-1. */
export function webpExtended(
  width: number,
  height: number,
  size?: number,
): Uint8Array {
  return pad(
    riff([
      ...ascii("VP8X"),
      ...u32le(10),
      0,
      0,
      0,
      0,
      ...u24le(width - 1),
      ...u24le(height - 1),
    ]),
    size,
  );
}

/** `RIFF....WEBP` with no chunk after it. */
export function webpHeaderOnly(): Uint8Array {
  return new Uint8Array(riff([]));
}

export function svg(): Uint8Array {
  return new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
  );
}

export function gif(): Uint8Array {
  return new Uint8Array([
    ...ascii("GIF89a"),
    ...u16le(100),
    ...u16le(100),
    0,
    0,
    0,
    0x3b,
  ]);
}
