import type { Validation } from "../catalog/validation.js";

export const MAX_LOGO_BYTES = 524_288;
export const MIN_LOGO_SIDE = 64;
export const MAX_LOGO_SIDE = 2_000;

/** Image types accepted for the logo (FR-002). SVG and GIF are out on purpose. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

export interface DetectedImage {
  type: LogoType;
  width: number;
  height: number;
}

export type LogoProblem =
  | "too_large"
  | "unsupported_format"
  | "content_mismatch"
  | "invalid_dimensions";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, expected: number[], at = 0): boolean {
  return (
    bytes.length >= at + expected.length &&
    expected.every((byte, index) => bytes[at + index] === byte)
  );
}

function ascii(text: string): number[] {
  return Array.from({ length: text.length }, (_, index) =>
    text.charCodeAt(index),
  );
}

const u16be = (b: Uint8Array, at: number): number =>
  ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u16le = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number =>
  (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, at: number): number =>
  (((b[at] ?? 0) << 24) |
    ((b[at + 1] ?? 0) << 16) |
    ((b[at + 2] ?? 0) << 8) |
    (b[at + 3] ?? 0)) >>>
  0;
const u32le = (b: Uint8Array, at: number): number =>
  ((b[at] ?? 0) |
    ((b[at + 1] ?? 0) << 8) |
    ((b[at + 2] ?? 0) << 16) |
    ((b[at + 3] ?? 0) << 24)) >>>
  0;

/** Type by the leading bytes only; says nothing about whether the header is complete. */
function sniffType(bytes: Uint8Array): LogoType | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return "image/webp";
  }
  return undefined;
}

function size(width: number, height: number) {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function readPng(bytes: Uint8Array) {
  if (bytes.length < 24 || !startsWith(bytes, ascii("IHDR"), 12)) {
    return undefined;
  }
  return size(u32be(bytes, 16), u32be(bytes, 20));
}

/** Frame header markers (SOF0 to SOF15) except DHT, JPG and DAC. */
function isFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function readJpeg(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (isFrameMarker(marker)) {
      if (offset + 9 > bytes.length) {
        return undefined;
      }
      return size(u16be(bytes, offset + 7), u16be(bytes, offset + 5));
    }
    if (marker === 0xd9 || marker === 0xda) {
      return undefined; // end of image / start of scan before any frame header
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2) {
      return undefined;
    }
    offset += 2 + length;
  }
  return undefined;
}

function readWebp(bytes: Uint8Array) {
  if (startsWith(bytes, ascii("VP8 "), 12)) {
    if (bytes.length < 30 || !startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
      return undefined;
    }
    return size(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (startsWith(bytes, ascii("VP8L"), 12)) {
    if (bytes.length < 25 || bytes[20] !== 0x2f) {
      return undefined;
    }
    const bits = u32le(bytes, 21);
    return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (startsWith(bytes, ascii("VP8X"), 12)) {
    if (bytes.length < 30) {
      return undefined;
    }
    return size(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  }
  return undefined;
}

/**
 * Reads type and size from the image header (PNG `IHDR`, JPEG frame header, WebP
 * `VP8`/`VP8L`/`VP8X`), with no decoding. `undefined` when the file is not one of the
 * three types or the header is incomplete (R5).
 */
export function detectImage(bytes: Uint8Array): DetectedImage | undefined {
  const type = sniffType(bytes);
  if (type === undefined) {
    return undefined;
  }
  const read =
    type === "image/png"
      ? readPng(bytes)
      : type === "image/jpeg"
        ? readJpeg(bytes)
        : readWebp(bytes);
  return read === undefined ? undefined : { type, ...read };
}

/**
 * Validates a logo upload (FR-003): at most 512 KB, PNG/JPEG/WebP by the bytes (not by
 * the name or the declared type), shorter side at least 64 and longer side at most 2000.
 * Returns the first problem found.
 */
export function validateLogo(
  bytes: Uint8Array,
  declaredType?: string,
): Validation<DetectedImage, LogoProblem> {
  if (bytes.length > MAX_LOGO_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  if (sniffType(bytes) === undefined) {
    return { ok: false, reason: "unsupported_format" };
  }
  const image = detectImage(bytes);
  if (image === undefined) {
    return { ok: false, reason: "content_mismatch" };
  }
  if (declaredType !== undefined && declaredType !== image.type) {
    return { ok: false, reason: "content_mismatch" };
  }
  if (
    Math.min(image.width, image.height) < MIN_LOGO_SIDE ||
    Math.max(image.width, image.height) > MAX_LOGO_SIDE
  ) {
    return { ok: false, reason: "invalid_dimensions" };
  }
  return { ok: true, value: image };
}
