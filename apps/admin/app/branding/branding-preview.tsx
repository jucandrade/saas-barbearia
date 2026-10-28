import type { CSSProperties } from "react";
import { resolveBrandTokens } from "@barbearia/ui";
import type { ThemeId, ToneId } from "@barbearia/domain";

interface Props {
  name: string;
  /** Absolute URL of the logo (the saved one or a local preview of the chosen file). */
  logoSrc: string | null;
  theme: ThemeId;
  primaryTone: ToneId;
  accentTone: ToneId;
}

/**
 * Preview of the identity (FR-006): a small, static mock of the panel painted with the tokens
 * of the chosen theme and colors. The variables are scoped to this component, so choosing a
 * theme here never changes the page around it. The accent badge never sits on a surface
 * filled with the primary color (R7).
 */
export function BrandingPreview({
  name,
  logoSrc,
  theme,
  primaryTone,
  accentTone,
}: Props) {
  const tokens = resolveBrandTokens(theme, primaryTone, accentTone);
  const shown = name.trim() === "" ? "Nome da barbearia" : name.trim();
  const frame: CSSProperties = {
    background: tokens.background,
    color: tokens.text,
    fontFamily: `'${tokens.fontBody}', system-ui, sans-serif`,
    border: `1px solid ${tokens.border}`,
    borderRadius: tokens.radiusLg,
    overflow: "hidden",
  };
  const title: CSSProperties = {
    fontFamily: `'${tokens.fontDisplay}', system-ui, sans-serif`,
    fontWeight: 700,
  };
  return (
    <section aria-label="Prévia da identidade visual" style={frame}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          background: tokens.surface,
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        {logoSrc !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or API URL, no optimization wanted
          <img
            src={logoSrc}
            alt=""
            style={{
              maxHeight: "2.5rem",
              maxWidth: "6rem",
              objectFit: "contain",
            }}
          />
        )}
        <span style={{ ...title, fontSize: "1.125rem" }}>{shown}</span>
        <span
          style={{ marginLeft: "auto", color: tokens.primary, fontWeight: 600 }}
        >
          Agenda
        </span>
      </div>
      <div style={{ display: "grid", gap: "0.75rem", padding: "1rem" }}>
        <div style={{ ...title, fontSize: "1.25rem" }}>Olá, Rafael</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem",
            background: tokens.surface,
            border: `1px solid ${tokens.accent}`,
            borderRadius: tokens.radiusMd,
          }}
        >
          <span>Sábado, 10:30 · Cabelo + Barba</span>
          <span
            style={{
              padding: "0.125rem 0.5rem",
              borderRadius: 999,
              background: tokens.accent,
              color: tokens.onAccent,
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            Confirmado
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span
            style={{
              padding: "0.5rem 1rem",
              borderRadius: tokens.radiusSm,
              background: tokens.primary,
              color: tokens.onPrimary,
              fontWeight: 600,
            }}
          >
            Agendar horário
          </span>
          <span style={{ color: tokens.primary, textDecoration: "underline" }}>
            Remarcar
          </span>
          <span style={{ color: tokens.error, fontSize: "0.875rem" }}>
            Erro de exemplo
          </span>
        </div>
      </div>
    </section>
  );
}
