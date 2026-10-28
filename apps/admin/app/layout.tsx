import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { BrandingProvider } from "./branding/branding-provider";
import { Header } from "./header";
import "./globals.css";

// The three themes bring their own fonts (Noir and Day: Bricolage Grotesque; Leather: Fraunces;
// all: Inter). They are self-hosted at build time and chosen at runtime by the theme.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Barbearia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${fraunces.variable} ${inter.variable}`}
    >
      <body>
        <BrandingProvider>
          <Header />
          {children}
        </BrandingProvider>
      </body>
    </html>
  );
}
