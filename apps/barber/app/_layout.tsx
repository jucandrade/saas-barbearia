import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BrandingProvider, useBrand } from "../lib/branding";

function Screens() {
  const { tokens } = useBrand();
  return (
    <>
      {/* The theme decides light or dark; the device mode is ignored. */}
      <StatusBar style={tokens.isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <BrandingProvider>
      <Screens />
    </BrandingProvider>
  );
}
