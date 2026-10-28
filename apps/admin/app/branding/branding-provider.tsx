"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Branding } from "@barbearia/contracts";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
} from "@barbearia/domain";
import { resolveBrandTokens, type BrandTokens } from "@barbearia/ui";
import { call } from "../../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/** Screens that come before the login always look like the product (FR-011). */
const PRODUCT_LOOK_PREFIXES = [
  "/sign-in",
  "/invitation",
  "/forgot-password",
  "/reset-password",
];

export interface BrandContext {
  tokens: BrandTokens;
  /** Display name from the identity; `undefined` while it is not known (or before the login). */
  name: string | undefined;
  /** Absolute URL of the logo, or `null` without one. */
  logoSrc: string | null;
  /** Asks for the identity again, for example right after the owner saved a change. */
  reload: () => void;
}

const DEFAULT_TOKENS = resolveBrandTokens(
  DEFAULT_THEME,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_ACCENT_TONE,
);

const Context = createContext<BrandContext>({
  tokens: DEFAULT_TOKENS,
  name: undefined,
  logoSrc: null,
  reload: () => undefined,
});

/** The identity of the barbershop for the screen being painted. */
export function useBrand(): BrandContext {
  return useContext(Context);
}

const FONT_VARIABLES: Record<string, string> = {
  "Bricolage Grotesque": "var(--font-bricolage), system-ui, sans-serif",
  Fraunces: "var(--font-fraunces), Georgia, serif",
  Inter: "var(--font-inter), system-ui, sans-serif",
};

/** Paints the tokens on the document: the CSS variables the screens already use (R8). */
function paint(tokens: BrandTokens): void {
  const root = document.documentElement;
  const values: Record<string, string> = {
    "--background": tokens.background,
    "--surface": tokens.surface,
    "--text": tokens.text,
    "--text-muted": tokens.textMuted,
    "--border": tokens.border,
    "--accent": tokens.primary,
    "--accent-text": tokens.onPrimary,
    "--highlight": tokens.accent,
    "--highlight-text": tokens.onAccent,
    "--error": tokens.error,
    "--warning": tokens.warning,
    "--success": tokens.success,
    "--font-display": FONT_VARIABLES[tokens.fontDisplay] ?? "system-ui",
    "--font-body": FONT_VARIABLES[tokens.fontBody] ?? "system-ui",
    "--radius-sm": `${String(tokens.radiusSm)}px`,
    "--radius-md": `${String(tokens.radiusMd)}px`,
    "--radius-lg": `${String(tokens.radiusLg)}px`,
  };
  for (const [name, value] of Object.entries(values)) {
    root.style.setProperty(name, value);
  }
  root.dataset["theme"] = tokens.theme;
  // The theme decides light or dark, also for native controls; the device mode is ignored (FR-026).
  root.style.colorScheme = tokens.isDark ? "dark" : "light";
}

/**
 * Loads the identity of the barbershop and paints it on the whole panel. It asks again at every
 * screen change, so a change by the owner shows on the next screen (FR-012). Before the first
 * answer it renders a plain background instead of the product look, so the theme of a light
 * barbershop does not flash dark.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const productLook = PRODUCT_LOOK_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
  const [branding, setBranding] = useState<Branding | undefined>();
  const [answered, setAnswered] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (productLook) return;
    let active = true;
    call("/branding", { schema: Branding })
      .then((response) => {
        if (!active) return;
        setBranding(response);
        setAnswered(true);
      })
      .catch(() => {
        // No session or no connection: the product look until a screen can ask again.
        if (!active) return;
        setBranding(undefined);
        setAnswered(true);
      });
    return () => {
      active = false;
    };
  }, [pathname, productLook, version]);

  const value = useMemo<BrandContext>(() => {
    const current = productLook ? undefined : branding;
    return {
      tokens:
        current === undefined
          ? DEFAULT_TOKENS
          : resolveBrandTokens(
              current.theme,
              current.primaryTone,
              current.accentTone,
            ),
      name: current?.name,
      logoSrc:
        current?.logoUrl === null || current === undefined
          ? null
          : `${API_BASE}${current.logoUrl}`,
      reload: () => {
        setVersion((previous) => previous + 1);
      },
    };
  }, [branding, productLook]);

  useEffect(() => {
    paint(value.tokens);
  }, [value.tokens]);

  if (!productLook && !answered) {
    return <div className="boot" aria-busy="true" />;
  }
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
