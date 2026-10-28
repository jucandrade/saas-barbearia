import { z } from "zod";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
  LOGO_TYPES,
  MAX_DISPLAY_NAME_LENGTH,
  THEME_IDS,
  TONE_IDS,
} from "@barbearia/domain";

/** Display name: trimmed, 1 to 80 characters (FR-001). */
export const DisplayName = z
  .string()
  .trim()
  .min(1, "Informe o nome.")
  .max(
    MAX_DISPLAY_NAME_LENGTH,
    `Use até ${String(MAX_DISPLAY_NAME_LENGTH)} caracteres.`,
  );

/** Inputs are strict: only the closed lists exist, there is no free color (FR-004, FR-024). */
export const ThemeInput = z.enum(THEME_IDS, {
  error: "Escolha um tema da lista.",
});
export const ToneInput = z.enum(TONE_IDS, {
  error: "Escolha uma cor da paleta.",
});

/**
 * Outputs tolerate a theme or tone the client does not know (for example an old app facing
 * a newer server) and fall back to the product default instead of failing to parse.
 */
export const ThemeOutput = z.enum(THEME_IDS).catch(DEFAULT_THEME);
export const PrimaryToneOutput = z.enum(TONE_IDS).catch(DEFAULT_PRIMARY_TONE);
export const AccentToneOutput = z.enum(TONE_IDS).catch(DEFAULT_ACCENT_TONE);

export const LogoType = z.enum(LOGO_TYPES);
export type LogoType = z.infer<typeof LogoType>;

/** Stable error codes added by the branding context (contracts/api.md, Conventions). */
export const BRANDING_ERROR_CODES = [
  "LOGO_TOO_LARGE",
  "LOGO_UNSUPPORTED_FORMAT",
  "LOGO_INVALID_DIMENSIONS",
  "LOGO_CONTENT_MISMATCH",
] as const;
export type BrandingErrorCode = (typeof BRANDING_ERROR_CODES)[number];
