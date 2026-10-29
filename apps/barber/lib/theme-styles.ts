import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useBrand } from "./branding";

/**
 * Styles shared by the screens, painted with the tokens of the barbershop theme (FR-009):
 * the primary color on buttons, the accent color on badges and selected items, and the fixed
 * state colors for errors. Screens add their own on top.
 */
export function useCommonStyles() {
  const { tokens, fonts } = useBrand();
  return useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          padding: 24,
          justifyContent: "center",
          gap: 8,
          backgroundColor: tokens.background,
        },
        scroll: { padding: 24, gap: 8, backgroundColor: tokens.background },
        center: {
          flex: 1,
          padding: 24,
          justifyContent: "center",
          backgroundColor: tokens.background,
        },
        title: {
          fontSize: 24,
          color: tokens.text,
          fontFamily: fonts.displayBold,
        },
        text: { color: tokens.text, fontFamily: fonts.body },
        muted: { color: tokens.textMuted, fontFamily: fonts.body },
        label: { color: tokens.text, fontFamily: fonts.bodyBold },
        field: {
          minHeight: 44,
          borderWidth: 1,
          borderColor: tokens.border,
          borderRadius: tokens.radiusSm,
          paddingHorizontal: 12,
          fontSize: 16,
          color: tokens.text,
          backgroundColor: tokens.surface,
          fontFamily: fonts.body,
        },
        error: { color: tokens.error, fontFamily: fonts.body },
        primaryButton: {
          minHeight: 44,
          marginTop: 12,
          borderRadius: tokens.radiusSm,
          backgroundColor: tokens.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        primaryButtonText: {
          color: tokens.onPrimary,
          fontFamily: fonts.bodyBold,
          fontSize: 16,
        },
        secondaryButton: {
          minHeight: 44,
          marginTop: 12,
          borderWidth: 1,
          borderColor: tokens.border,
          borderRadius: tokens.radiusSm,
          alignItems: "center",
          justifyContent: "center",
        },
        secondaryButtonText: {
          color: tokens.text,
          fontFamily: fonts.bodyBold,
          fontSize: 16,
        },
        disabled: { opacity: 0.6 },
        card: {
          padding: 12,
          gap: 2,
          borderWidth: 1,
          borderColor: tokens.border,
          borderRadius: tokens.radiusMd,
          backgroundColor: tokens.surface,
        },
        cardSelected: { borderColor: tokens.accent, borderWidth: 2 },
        badge: {
          alignSelf: "flex-start",
          marginTop: 4,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: tokens.accent,
          color: tokens.onAccent,
          fontFamily: fonts.bodyBold,
          fontSize: 12,
        },
        link: {
          color: tokens.primary,
          fontFamily: fonts.bodyBold,
          fontSize: 16,
        },
      }),
    [tokens, fonts],
  );
}
