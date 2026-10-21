import { normalizarEmail } from "./email.js";
import { SENHAS_COMUNS } from "./senhas-comuns.js";

export const TAMANHO_MINIMO_SENHA = 8;
export const TAMANHO_MAXIMO_SENHA = 128;

export type MotivoSenhaInvalida =
  "curta" | "longa" | "comum" | "igual_ao_email" | "igual_ao_nome";

export type ResultadoSenha =
  { valida: true } | { valida: false; motivo: MotivoSenhaInvalida };

export interface ContextoSenha {
  email: string;
  nome: string;
}

/**
 * Política de senha (FR-011): entre 8 e 128 caracteres, fora da lista de senhas
 * comuns e diferente do e-mail e do nome do usuário. Sem regras de composição.
 */
export function validarSenha(
  senha: string,
  contexto: ContextoSenha,
): ResultadoSenha {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return { valida: false, motivo: "curta" };
  }
  if (senha.length > TAMANHO_MAXIMO_SENHA) {
    return { valida: false, motivo: "longa" };
  }
  const minuscula = senha.toLowerCase();
  if (SENHAS_COMUNS.has(minuscula)) {
    return { valida: false, motivo: "comum" };
  }
  if (minuscula === normalizarEmail(contexto.email)) {
    return { valida: false, motivo: "igual_ao_email" };
  }
  if (minuscula === contexto.nome.trim().toLowerCase()) {
    return { valida: false, motivo: "igual_ao_nome" };
  }
  return { valida: true };
}
