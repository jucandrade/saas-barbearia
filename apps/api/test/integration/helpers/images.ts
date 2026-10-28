/**
 * Minimal image headers assembled byte by byte for the HTTP tests (the repository carries no
 * binary files). Valid for header reading only, which is all the API does with a logo.
 */

function pad(bytes: number[], size?: number): Buffer {
  const out = Buffer.alloc(Math.max(size ?? 0, bytes.length));
  Buffer.from(bytes).copy(out);
  return out;
}

const ascii = (text: string): number[] => [...Buffer.from(text, "ascii")];
const u32be = (n: number): number[] => [
  ...Buffer.from([n >>> 24, n >>> 16, n >>> 8, n].map((b) => b & 0xff)),
];
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >>> 8) & 0xff];
const u32le = (n: number): number[] => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
];

export function png(width: number, height: number, size?: number): Buffer {
  return pad(
    [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...u32be(13),
      ...ascii("IHDR"),
      ...u32be(width),
      ...u32be(height),
      8,
      6,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    size,
  );
}

export function jpeg(width: number, height: number, size?: number): Buffer {
  return pad(
    [
      0xff,
      0xd8,
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
      0xff,
      0xc0,
      ...u16be(17),
      8,
      ...u16be(height),
      ...u16be(width),
      3,
      1,
      0x22,
      0,
      2,
      0x11,
      1,
      3,
      0x11,
      1,
      0xff,
      0xd9,
    ],
    size,
  );
}

export function webp(width: number, height: number, size?: number): Buffer {
  const chunk = [
    ...ascii("VP8 "),
    ...u32le(10),
    0x30,
    0x01,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...u16le(width),
    ...u16le(height),
  ];
  return pad(
    [...ascii("RIFF"), ...u32le(chunk.length + 4), ...ascii("WEBP"), ...chunk],
    size,
  );
}

export const svg = (): Buffer =>
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
  );

export const gif = (): Buffer =>
  Buffer.from([
    ...ascii("GIF89a"),
    ...u16le(100),
    ...u16le(100),
    0,
    0,
    0,
    0x3b,
  ]);

/** A PNG cut right after its signature. */
export const truncatedPng = (): Buffer =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
