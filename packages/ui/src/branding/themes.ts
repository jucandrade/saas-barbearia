import type { ThemeId } from "@barbearia/domain";

export interface Theme {
  id: ThemeId;
  /** Name shown to the owner (pt-BR). */
  name: string;
  /** The theme defines light or dark; the device mode is ignored (FR-026). */
  isDark: boolean;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  fontDisplay: string;
  fontBody: string;
  radius: { sm: number; md: number; lg: number };
}

/** Bases, fonts and shapes of the three themes, taken from the round 2 mockups. */
export const THEMES: Record<ThemeId, Theme> = {
  noir: {
    id: "noir",
    name: "Noir",
    isDark: true,
    background: "#111111",
    surface: "#1C1C1C",
    text: "#F2EDE4",
    textMuted: "#A8A196",
    border: "#3A3A3A",
    fontDisplay: "Bricolage Grotesque",
    fontBody: "Inter",
    radius: { sm: 12, md: 14, lg: 22 },
  },
  day: {
    id: "day",
    name: "Dia",
    isDark: false,
    background: "#FAF7F2",
    surface: "#FFFFFF",
    text: "#17140F",
    textMuted: "#6B655B",
    border: "#E8E2D6",
    fontDisplay: "Bricolage Grotesque",
    fontBody: "Inter",
    radius: { sm: 12, md: 14, lg: 18 },
  },
  leather: {
    id: "leather",
    name: "Couro",
    isDark: true,
    background: "#0E2620",
    surface: "#153229",
    text: "#EFE9DC",
    textMuted: "#A9B8AE",
    border: "#2F5A4A",
    fontDisplay: "Fraunces",
    fontBody: "Inter",
    radius: { sm: 10, md: 14, lg: 18 },
  },
};
