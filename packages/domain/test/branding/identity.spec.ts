import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
  MAX_DISPLAY_NAME_LENGTH,
  THEME_IDS,
  TONE_IDS,
  isThemeId,
  isToneId,
  validateDisplayName,
} from "../../src/branding/identity.js";

describe("themes and tones", () => {
  it("has exactly the three themes, in display order", () => {
    expect(THEME_IDS).toEqual(["noir", "day", "leather"]);
  });

  it("has exactly the ten tones of the palette, in display order", () => {
    expect(TONE_IDS).toEqual([
      "gold",
      "terracotta",
      "sage",
      "blue",
      "violet",
      "rose",
      "teal",
      "orange",
      "wine",
      "graphite",
    ]);
  });

  it("uses Noir with gold as the product default", () => {
    expect(DEFAULT_THEME).toBe("noir");
    expect(DEFAULT_PRIMARY_TONE).toBe("gold");
    expect(DEFAULT_ACCENT_TONE).toBe("gold");
  });

  it.each(["noir", "day", "leather"])("accepts the theme %s", (theme) => {
    expect(isThemeId(theme)).toBe(true);
  });

  it.each(["sepia", "NOIR", "#ff0000", "", undefined, null, 3])(
    "rejects %s as a theme",
    (theme) => {
      expect(isThemeId(theme)).toBe(false);
    },
  );

  it.each(["gold", "graphite", "wine"])("accepts the tone %s", (tone) => {
    expect(isToneId(tone)).toBe(true);
  });

  it.each(["#D4A853", "red", "", undefined, null, {}])(
    "rejects %s as a tone",
    (tone) => {
      expect(isToneId(tone)).toBe(false);
    },
  );
});

describe("validateDisplayName", () => {
  it("returns the trimmed name", () => {
    expect(validateDisplayName("  Barbearia do Billy  ")).toEqual({
      ok: true,
      value: "Barbearia do Billy",
    });
  });

  it("accepts 1 and 80 characters", () => {
    expect(validateDisplayName("B")).toEqual({ ok: true, value: "B" });
    const name = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(name)).toEqual({ ok: true, value: name });
  });

  it("measures the length after trimming", () => {
    const name = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(`  ${name}  `)).toEqual({
      ok: true,
      value: name,
    });
  });

  it.each(["", "   ", "\t\n"])("rejects %j as empty", (name) => {
    expect(validateDisplayName(name)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects 81 characters as too long", () => {
    expect(validateDisplayName("a".repeat(81))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});
