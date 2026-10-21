import type { Papel } from "./papel.js";

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Inatividade tolerada por papel (FR-013): dono 12 horas, barbeiro 30 dias. */
export function duracaoSessao(papel: Papel): number {
  return papel === "dono" ? 12 * HORA_MS : 30 * DIA_MS;
}

/** Hora de expiração de uma sessão usada em `agora` (o relógio vem de fora). */
export function calcularExpiracao(papel: Papel, agora: Date): Date {
  return new Date(agora.getTime() + duracaoSessao(papel));
}

export interface SessaoParaAvaliar {
  expiraEm: Date;
  revogadaEm: Date | null;
}

export function sessaoVigente(sessao: SessaoParaAvaliar, agora: Date): boolean {
  return (
    sessao.revogadaEm === null && sessao.expiraEm.getTime() > agora.getTime()
  );
}
