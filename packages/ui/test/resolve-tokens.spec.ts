import { describe, expect, it } from "vitest";
import { THEME_IDS, type ThemeId, type ToneId } from "@barbearia/domain";
import {
  PALETTE,
  STATE_COLORS,
  THEMES,
  resolveBrandTokens,
} from "../src/index.js";

function tone(id: ToneId) {
  const found = PALETTE.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`tone ${id} missing from the palette`);
  }
  return found;
}

describe("resolveBrandTokens", () => {
  it("uses the dark variant of a tone on dark themes", () => {
    const tokens = resolveBrandTokens("noir", "blue", "gold");
    expect(tokens.primary).toBe(tone("blue").onDark);
    expect(tokens.accent).toBe(tone("gold").onDark);
  });

  it("uses the light variant of a tone on the light theme", () => {
    const tokens = resolveBrandTokens("day", "blue", "gold");
    expect(tokens.primary).toBe(tone("blue").onLight);
    expect(tokens.accent).toBe(tone("gold").onLight);
  });

  it("takes the theme bases as they are", () => {
    const tokens = resolveBrandTokens("leather", "sage", "sage");
    expect(tokens.background).toBe(THEMES.leather.background);
    expect(tokens.surface).toBe(THEMES.leather.surface);
    expect(tokens.text).toBe(THEMES.leather.text);
  });

  it("sets the fonts by theme: Fraunces only for Leather, Inter always for text", () => {
    expect(resolveBrandTokens("noir", "gold", "gold").fontDisplay).toBe(
      "Bricolage Grotesque",
    );
    expect(resolveBrandTokens("day", "gold", "gold").fontDisplay).toBe(
      "Bricolage Grotesque",
    );
    expect(resolveBrandTokens("leather", "gold", "gold").fontDisplay).toBe(
      "Fraunces",
    );
    for (const theme of THEME_IDS) {
      expect(resolveBrandTokens(theme, "gold", "gold").fontBody).toBe("Inter");
    }
  });

  it("marks Noir and Leather as dark and Day as light", () => {
    expect(resolveBrandTokens("noir", "gold", "gold").isDark).toBe(true);
    expect(resolveBrandTokens("leather", "gold", "gold").isDark).toBe(true);
    expect(resolveBrandTokens("day", "gold", "gold").isDark).toBe(false);
  });

  it("accepts the same tone as primary and accent", () => {
    const tokens = resolveBrandTokens("day", "teal", "teal");
    expect(tokens.primary).toBe(tokens.accent);
    expect(tokens.onPrimary).toBe(tokens.onAccent);
  });

  it("keeps the state colors fixed whatever the tones", () => {
    const first = resolveBrandTokens("noir", "wine", "rose");
    const second = resolveBrandTokens("noir", "sage", "blue");
    expect(first.error).toBe(second.error);
    expect(first.warning).toBe(second.warning);
    expect(first.success).toBe(second.success);
    expect(first.error).toBe(STATE_COLORS.dark.error);
    expect(resolveBrandTokens("day", "wine", "rose").error).toBe(
      STATE_COLORS.light.error,
    );
  });

  it("falls back to Noir and gold for an unknown theme or tone, never throwing", () => {
    const unknownTheme = resolveBrandTokens("sepia" as ThemeId, "gold", "gold");
    expect(unknownTheme).toEqual(resolveBrandTokens("noir", "gold", "gold"));

    const unknownTone = resolveBrandTokens("day", "magenta" as ToneId, "gold");
    expect(unknownTone.primary).toBe(
      resolveBrandTokens("day", "gold", "gold").primary,
    );
  });

  it("exposes exactly the same token keys on every theme (same screens, FR-025)", () => {
    const reference = Object.keys(
      resolveBrandTokens("noir", "gold", "gold"),
    ).sort();
    for (const theme of THEME_IDS) {
      expect(
        Object.keys(resolveBrandTokens(theme, "gold", "gold")).sort(),
      ).toEqual(reference);
    }
  });
});
