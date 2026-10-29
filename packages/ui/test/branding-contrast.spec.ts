import { describe, expect, it } from "vitest";
import { THEME_IDS, TONE_IDS } from "@barbearia/domain";
import {
  PALETTE,
  STATE_COLORS,
  THEMES,
  contrastRatio,
  resolveBrandTokens,
} from "../src/index.js";

const MIN_TEXT_CONTRAST = 4.5;

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for equal colors", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("does not depend on the order of the colors", () => {
    expect(contrastRatio("#D4A853", "#111111")).toBeCloseTo(
      contrastRatio("#111111", "#D4A853"),
      10,
    );
  });
});

describe("palette", () => {
  it("has exactly the ten tones of the domain, in order", () => {
    expect(PALETTE.map((tone) => tone.id)).toEqual([...TONE_IDS]);
  });

  it("keeps the gold light variant that passes the minimum contrast", () => {
    const gold = PALETTE.find((tone) => tone.id === "gold");
    expect(gold?.onLight).toBe("#946006");
    expect(gold?.onLight).not.toBe("#A86B0C"); // 4.12:1 on the Day background, fails
  });
});

describe.each(THEME_IDS)("theme %s", (themeId) => {
  const theme = THEMES[themeId];
  const states = theme.isDark ? STATE_COLORS.dark : STATE_COLORS.light;

  it("reads text and secondary text on background and surface", () => {
    for (const color of [theme.text, theme.textMuted]) {
      expect(contrastRatio(color, theme.background)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
      expect(contrastRatio(color, theme.surface)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    }
  });

  it.each(["error", "warning", "success"] as const)(
    "reads the fixed %s color on background and surface",
    (state) => {
      expect(
        contrastRatio(states[state], theme.background),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(
        contrastRatio(states[state], theme.surface),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    },
  );

  it.each(TONE_IDS)(
    "reads the tone %s as text and under its own label",
    (tone) => {
      const tokens = resolveBrandTokens(themeId, tone, tone);
      // Tone as link/text on the page and on cards.
      expect(
        contrastRatio(tokens.primary, theme.background),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(
        contrastRatio(tokens.primary, theme.surface),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      // Label on a filled button / badge.
      expect(
        contrastRatio(tokens.onPrimary, tokens.primary),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(
        contrastRatio(tokens.onAccent, tokens.accent),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    },
  );
});
