import { Image, StyleSheet, Text, View } from "react-native";
import { useBrand } from "./branding";

/** Logo and name of the barbershop. The logo sits on the theme surface, so a transparent one stays readable. */
export function BrandHeader({ name }: { name?: string }) {
  const { tokens, fonts, logoSrc, name: brandName } = useBrand();
  const shown = name ?? brandName;
  return (
    <View style={styles.row}>
      {logoSrc !== null && (
        <Image
          source={{ uri: logoSrc }}
          style={[
            styles.logo,
            {
              backgroundColor: tokens.surface,
              borderRadius: tokens.radiusSm,
            },
          ]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      )}
      {shown !== undefined && (
        <Text
          accessibilityRole="header"
          style={[
            styles.name,
            { color: tokens.text, fontFamily: fonts.displayBold },
          ]}
        >
          {shown}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 96, height: 40, padding: 2 },
  name: { fontSize: 24, flexShrink: 1 },
});
