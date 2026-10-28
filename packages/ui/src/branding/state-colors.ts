export interface StateColors {
  error: string;
  warning: string;
  success: string;
}

/**
 * Error, warning and success colors are fixed by the product and never come from the palette
 * (FR-023), so a barbershop can never make an error look like part of its identity.
 */
export const STATE_COLORS: { dark: StateColors; light: StateColors } = {
  dark: { error: "#FF8A80", warning: "#F2B84B", success: "#6FCF97" },
  light: { error: "#B3261E", warning: "#8A5A00", success: "#1E7B4A" },
};
