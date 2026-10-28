import { useFonts } from "expo-font";
import { usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { Branding } from "@barbearia/contracts";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
} from "@barbearia/domain";
import { resolveBrandTokens, type BrandTokens } from "@barbearia/ui";
import { API_BASE, call } from "./api";
import { readToken } from "./session";

void SplashScreen.preventAutoHideAsync();

/** Font families (as registered by `useFonts`) the screens use, by role. */
export interface BrandFonts {
  display: string;
  displayBold: string;
  body: string;
  bodyBold: string;
}

export interface BrandContext {
  tokens: BrandTokens;
  fonts: BrandFonts;
  /** Display name from the identity; `undefined` before the login or while unknown. */
  name: string | undefined;
  /** Absolute URL of the logo, or `null` without one. */
  logoSrc: string | null;
}

const DEFAULT_TOKENS = resolveBrandTokens(
  DEFAULT_THEME,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_ACCENT_TONE,
);

function fontsFor(tokens: BrandTokens): BrandFonts {
  const serif = tokens.fontDisplay === "Fraunces";
  return {
    display: serif ? "Fraunces_500Medium" : "BricolageGrotesque_500Medium",
    displayBold: serif ? "Fraunces_600SemiBold" : "BricolageGrotesque_700Bold",
    body: "Inter_400Regular",
    bodyBold: "Inter_600SemiBold",
  };
}

const Context = createContext<BrandContext>({
  tokens: DEFAULT_TOKENS,
  fonts: fontsFor(DEFAULT_TOKENS),
  name: undefined,
  logoSrc: null,
});

/** The identity of the barbershop for the screen being painted. The device light/dark mode is ignored (FR-026). */
export function useBrand(): BrandContext {
  return useContext(Context);
}

/** The screens that come before the login always look like the product (FR-011). */
const PRODUCT_LOOK_PATHS = new Set(["/sign-in"]);

/**
 * Loads the identity of the barbershop with the session token and the fonts of the themes. It
 * asks again at every screen change, so a change by the owner shows on the next screen
 * (FR-012, SC-006). The splash stays up until fonts and the first answer are ready, or failed.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const productLook = PRODUCT_LOOK_PATHS.has(pathname);
  const [branding, setBranding] = useState<Branding | undefined>();
  const [answered, setAnswered] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (productLook) return;
    let active = true;
    void (async () => {
      const token = await readToken();
      if (token === undefined) {
        if (active) {
          setBranding(undefined);
          setAnswered(true);
        }
        return;
      }
      try {
        const response = await call("/branding", { token, schema: Branding });
        if (active) setBranding(response);
      } catch {
        // No connection or an expired session: the screens handle that themselves.
        if (active) setBranding(undefined);
      } finally {
        if (active) setAnswered(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, productLook]);

  const value = useMemo<BrandContext>(() => {
    const current = productLook ? undefined : branding;
    const tokens =
      current === undefined
        ? DEFAULT_TOKENS
        : resolveBrandTokens(
            current.theme,
            current.primaryTone,
            current.accentTone,
          );
    return {
      tokens,
      fonts: fontsFor(tokens),
      name: current?.name,
      logoSrc:
        current?.logoUrl === null || current === undefined
          ? null
          : `${API_BASE}${current.logoUrl}`,
    };
  }, [branding, productLook]);

  const ready =
    (fontsLoaded || fontError !== null) && (productLook || answered);
  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
