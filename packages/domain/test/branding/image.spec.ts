import { describe, expect, it } from "vitest";
import {
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  MAX_LOGO_SIDE,
  MIN_LOGO_SIDE,
  detectImage,
  validateLogo,
} from "../../src/branding/image.js";
import {
  gif,
  jpeg,
  jpegSoiOnly,
  jpegWithoutFrame,
  png,
  pngShortHeader,
  pngSignatureOnly,
  svg,
  webpExtended,
  webpHeaderOnly,
  webpLossless,
  webpLossy,
} from "./image-fixtures.js";

describe("constants", () => {
  it("matches the limits of the spec", () => {
    expect(MAX_LOGO_BYTES).toBe(524_288);
    expect(MIN_LOGO_SIDE).toBe(64);
    expect(MAX_LOGO_SIDE).toBe(2_000);
    expect(LOGO_TYPES).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });
});

describe("detectImage", () => {
  it("reads PNG type and size", () => {
    expect(detectImage(png(200, 120))).toEqual({
      type: "image/png",
      width: 200,
      height: 120,
    });
  });

  it("reads JPEG type and size (baseline)", () => {
    expect(detectImage(jpeg(640, 480))).toEqual({
      type: "image/jpeg",
      width: 640,
      height: 480,
    });
  });

  it("reads JPEG type and size (progressive, after an EXIF segment)", () => {
    expect(
      detectImage(jpeg(300, 90, { progressive: true, exif: true })),
    ).toEqual({ type: "image/jpeg", width: 300, height: 90 });
  });

  it("reads WebP lossy size", () => {
    expect(detectImage(webpLossy(256, 128))).toEqual({
      type: "image/webp",
      width: 256,
      height: 128,
    });
  });

  it("reads WebP lossless size", () => {
    expect(detectImage(webpLossless(512, 64))).toEqual({
      type: "image/webp",
      width: 512,
      height: 64,
    });
  });

  it("reads WebP extended size", () => {
    expect(detectImage(webpExtended(1999, 2000))).toEqual({
      type: "image/webp",
      width: 1999,
      height: 2000,
    });
  });

  it.each([
    ["an SVG", svg()],
    ["a GIF", gif()],
    ["an empty file", new Uint8Array()],
    ["random text", new TextEncoder().encode("not an image at all")],
    ["a PNG cut after the signature", pngSignatureOnly()],
    ["a PNG with a short IHDR", pngShortHeader()],
    ["a JPEG cut after the SOI marker", jpegSoiOnly()],
    ["a JPEG without a frame header", jpegWithoutFrame()],
    ["a WebP with no chunk", webpHeaderOnly()],
  ])("returns undefined for %s", (_name, bytes) => {
    expect(detectImage(bytes)).toBeUndefined();
  });
});

describe("validateLogo", () => {
  it("accepts a valid logo and returns type and size", () => {
    expect(validateLogo(png(200, 200))).toEqual({
      ok: true,
      value: { type: "image/png", width: 200, height: 200 },
    });
  });

  it("accepts the declared type when it matches the bytes", () => {
    expect(validateLogo(jpeg(200, 200), "image/jpeg").ok).toBe(true);
    expect(validateLogo(webpLossy(200, 200), "image/webp").ok).toBe(true);
  });

  it("accepts exactly 524288 bytes and rejects one more", () => {
    expect(validateLogo(png(200, 200, 524_288)).ok).toBe(true);
    expect(validateLogo(png(200, 200, 524_289))).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("reports the size problem before looking at the content", () => {
    expect(validateLogo(new Uint8Array(524_289))).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("accepts the shorter side at 64 and rejects 63", () => {
    expect(validateLogo(png(64, 500)).ok).toBe(true);
    expect(validateLogo(png(500, 63))).toEqual({
      ok: false,
      reason: "invalid_dimensions",
    });
    expect(validateLogo(png(63, 63))).toEqual({
      ok: false,
      reason: "invalid_dimensions",
    });
  });

  it("accepts the longer side at 2000 and rejects 2001", () => {
    expect(validateLogo(png(2000, 100)).ok).toBe(true);
    expect(validateLogo(png(2001, 100))).toEqual({
      ok: false,
      reason: "invalid_dimensions",
    });
    expect(validateLogo(webpExtended(100, 2001))).toEqual({
      ok: false,
      reason: "invalid_dimensions",
    });
  });

  it.each([
    ["an SVG", svg()],
    ["a GIF", gif()],
    ["an empty file", new Uint8Array()],
    ["plain text", new TextEncoder().encode("hello")],
  ])("rejects %s as an unsupported format", (_name, bytes) => {
    expect(validateLogo(bytes)).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
  });

  it("rejects a declared type that differs from the detected one", () => {
    expect(validateLogo(jpeg(200, 200), "image/png")).toEqual({
      ok: false,
      reason: "content_mismatch",
    });
    expect(validateLogo(png(200, 200), "image/gif")).toEqual({
      ok: false,
      reason: "content_mismatch",
    });
  });

  it.each([
    ["a PNG cut after the signature", pngSignatureOnly()],
    ["a PNG with a short IHDR", pngShortHeader()],
    ["a JPEG cut after the SOI marker", jpegSoiOnly()],
    ["a WebP with no chunk", webpHeaderOnly()],
  ])("rejects %s as a content mismatch", (_name, bytes) => {
    expect(validateLogo(bytes)).toEqual({
      ok: false,
      reason: "content_mismatch",
    });
  });
});
