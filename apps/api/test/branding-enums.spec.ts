import { describe, expect, it } from "vitest";
import { LOGO_TYPES, THEME_IDS, TONE_IDS } from "@barbearia/domain";
import {
  brandingEventType,
  brandingTheme,
  brandingTone,
  logoType,
} from "../src/db/schema/index.js";

describe("database enums mirror the domain constants", () => {
  it("themes", () => {
    expect(brandingTheme.enumValues).toEqual([...THEME_IDS]);
  });

  it("tones", () => {
    expect(brandingTone.enumValues).toEqual([...TONE_IDS]);
  });

  it("logo types", () => {
    expect(logoType.enumValues).toEqual([...LOGO_TYPES]);
  });

  it("branding events", () => {
    expect(brandingEventType.enumValues).toEqual([
      "branding_updated",
      "logo_changed",
      "logo_removed",
      "branding_reset",
    ]);
  });
});
