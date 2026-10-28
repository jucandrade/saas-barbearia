import type { ToneId } from "@barbearia/domain";

export interface Tone {
  id: ToneId;
  /** Name shown to the owner (pt-BR). */
  name: string;
  /** Variant used on dark themes (Noir, Leather). */
  onDark: string;
  /** Variant used on the light theme (Day). */
  onLight: string;
}

/**
 * The closed palette (FR-004). Every variant reads at 4.5:1 or more as text on the base and
 * the surface of every theme and carries a readable label when used as a fill, which is what
 * makes any primary × accent pair safe (research R7). The gold light variant is #946006: the
 * mockup value #A86B0C only reaches 4.12:1 on the Day background.
 */
export const PALETTE: readonly Tone[] = [
  { id: "gold", name: "Ouro", onDark: "#D4A853", onLight: "#946006" },
  {
    id: "terracotta",
    name: "Terracota",
    onDark: "#E07A5F",
    onLight: "#A5412A",
  },
  { id: "sage", name: "Sálvia", onDark: "#7FB77E", onLight: "#2F6B4F" },
  { id: "blue", name: "Azul", onDark: "#7FA8F0", onLight: "#2A4FB0" },
  { id: "violet", name: "Violeta", onDark: "#B79CF0", onLight: "#5B3FB0" },
  { id: "rose", name: "Rosa", onDark: "#EE8FB0", onLight: "#A62F63" },
  { id: "teal", name: "Turquesa", onDark: "#4FC4C0", onLight: "#116B6B" },
  { id: "orange", name: "Laranja", onDark: "#F29A4E", onLight: "#A5520A" },
  { id: "wine", name: "Vinho", onDark: "#E3808E", onLight: "#8C2A3C" },
  { id: "graphite", name: "Grafite", onDark: "#C9C6BE", onLight: "#47443D" },
];
