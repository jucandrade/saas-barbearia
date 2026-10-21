import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Header } from "./header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barbearia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
