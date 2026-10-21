import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cabecalho } from "./cabecalho";
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
        <Cabecalho />
        {children}
      </body>
    </html>
  );
}
