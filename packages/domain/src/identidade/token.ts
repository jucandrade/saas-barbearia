/** Validade dos links de acesso (clarificações da spec). */
export const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;
export const VALIDADE_RECUPERACAO_MS = 60 * 60 * 1000;

export type FinalidadeToken = "convite" | "recuperacao";

export interface TokenParaAvaliar {
  expiraEm: Date;
  usadoEm: Date | null;
  invalidadoEm: Date | null;
}

export function calcularExpiracaoToken(
  finalidade: FinalidadeToken,
  agora: Date,
): Date {
  const validade =
    finalidade === "convite" ? VALIDADE_CONVITE_MS : VALIDADE_RECUPERACAO_MS;
  return new Date(agora.getTime() + validade);
}

/** Uso único: só vale se não foi usado, não foi substituído e não expirou. */
export function tokenVigente(token: TokenParaAvaliar, agora: Date): boolean {
  return (
    token.usadoEm === null &&
    token.invalidadoEm === null &&
    token.expiraEm.getTime() > agora.getTime()
  );
}
