import {
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
  isThemeId,
  isToneId,
  type ThemeId,
  type ToneId,
} from "@barbearia/domain";
import { contrastRatio } from "./contrast.js";
import { PALETTE, type Tone } from "./palette.js";
import { STATE_COLORS } from "./state-colors.js";
import { THEMES } from "./themes.js";

export interface BrandTokens {
  theme: ThemeId;
  isDark: boolean;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  /** Primary color: buttons, links, header and active menu item (FR-009). */
  primary: string;
  /** Readable label color on a primary fill. */
  onPrimary: string;
  /** Accent color: badges, selected items and highlights (FR-009). */
  accent: string;
  /** Readable label color on an accent fill. */
  onAccent: string;
  error: string;
  warning: string;
  success: string;
  fontDisplay: string;
  fontBody: string;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
}

const DARK_LABEL = "#111111";
const LIGHT_LABEL = "#FFFFFF";

function toneOrDefault(id: ToneId): Tone {
  const wanted = isToneId(id) ? id : DEFAULT_PRIMARY_TONE;
  const found = PALETTE.find((tone) => tone.id === wanted);
  if (found === undefined) {
    throw new Error(`The palette has no tone "${wanted}"`);
  }
  return found;
}

/** The label color (dark or white) with the better contrast on a fill. */
function labelOn(fill: string): string {
  return contrastRatio(fill, DARK_LABEL) >= contrastRatio(fill, LIGHT_LABEL)
    ? DARK_LABEL
    : LIGHT_LABEL;
}

/**
 * Turns the barbershop identity into the flat set of values panel and apps paint with.
 * Unknown theme or tone (for example from a newer server) falls back to the product
 * default instead of failing.
 */
export function resolveBrandTokens(
  theme: ThemeId,
  primaryTone: ToneId,
  accentTone: ToneId,
): BrandTokens {
  const base = THEMES[isThemeId(theme) ? theme : DEFAULT_THEME];
  const states = base.isDark ? STATE_COLORS.dark : STATE_COLORS.light;
  const pick = (tone: Tone) => (base.isDark ? tone.onDark : tone.onLight);
  const primary = pick(toneOrDefault(primaryTone));
  const accent = pick(toneOrDefault(accentTone));
  return {
    theme: base.id,
    isDark: base.isDark,
    background: base.background,
    surface: base.surface,
    text: base.text,
    textMuted: base.textMuted,
    border: base.border,
    primary,
    onPrimary: labelOn(primary),
    accent,
    onAccent: labelOn(accent),
    error: states.error,
    warning: states.warning,
    success: states.success,
    fontDisplay: base.fontDisplay,
    fontBody: base.fontBody,
    radiusSm: base.radius.sm,
    radiusMd: base.radius.md,
    radiusLg: base.radius.lg,
  };
}
