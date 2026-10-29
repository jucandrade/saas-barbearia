import type { Validation } from "../catalog/validation.js";

/** The three closed themes, in display order (FR-024). */
export const THEME_IDS = ["noir", "day", "leather"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** The ten tones of the closed palette, in display order (FR-004). */
export const TONE_IDS = [
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
] as const;
export type ToneId = (typeof TONE_IDS)[number];

/** Product look for a barbershop that never customized anything (FR-010). */
export const DEFAULT_THEME: ThemeId = "noir";
export const DEFAULT_PRIMARY_TONE: ToneId = "gold";
export const DEFAULT_ACCENT_TONE: ToneId = "gold";

export const MAX_DISPLAY_NAME_LENGTH = 80;

export type DisplayNameProblem = "empty" | "too_long";

export function isThemeId(value: unknown): value is ThemeId {
  return THEME_IDS.some((theme) => theme === value);
}

export function isToneId(value: unknown): value is ToneId {
  return TONE_IDS.some((tone) => tone === value);
}

/** Display name: 1 to 80 characters after trimming (FR-001). */
export function validateDisplayName(
  name: string,
): Validation<string, DisplayNameProblem> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value: trimmed };
}
