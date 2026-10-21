/** Bloqueio de login por conta (FR-015): 5 falhas seguidas, 15 minutos. */
export const MAX_FALHAS_LOGIN = 5;
export const DURACAO_BLOQUEIO_MS = 15 * 60 * 1000;

export interface EstadoLogin {
  tentativasFalhas: number;
  bloqueadoAte: Date | null;
}

export type AvaliacaoLogin =
  { bloqueado: true } | { bloqueado: false; estado: EstadoLogin };

function estaBloqueado(estado: EstadoLogin, agora: Date): boolean {
  return (
    estado.bloqueadoAte !== null &&
    estado.bloqueadoAte.getTime() > agora.getTime()
  );
}

/** Diz se a tentativa pode seguir; passado o bloqueio, devolve o estado zerado. */
export function avaliarTentativaLogin(
  estado: EstadoLogin,
  agora: Date,
): AvaliacaoLogin {
  if (estaBloqueado(estado, agora)) {
    return { bloqueado: true };
  }
  if (estado.bloqueadoAte !== null) {
    return { bloqueado: false, estado: registrarSucessoLogin() };
  }
  return { bloqueado: false, estado };
}

export function registrarFalhaLogin(
  estado: EstadoLogin,
  agora: Date,
): EstadoLogin {
  if (estaBloqueado(estado, agora)) {
    return estado;
  }
  const tentativasFalhas = estado.tentativasFalhas + 1;
  return {
    tentativasFalhas,
    bloqueadoAte:
      tentativasFalhas >= MAX_FALHAS_LOGIN
        ? new Date(agora.getTime() + DURACAO_BLOQUEIO_MS)
        : null,
  };
}

export function registrarSucessoLogin(): EstadoLogin {
  return { tentativasFalhas: 0, bloqueadoAte: null };
}
