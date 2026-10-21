import type { Papel, SituacaoUsuario } from "./papel.js";

export interface UsuarioEquipe {
  id: string;
  papel: Papel;
  situacao: SituacaoUsuario;
}

/**
 * Regra do último dono (FR-005): uma barbearia sempre mantém ao menos um dono
 * ativo, então o último não pode ser desativado.
 */
export function podeDesativar(
  usuario: UsuarioEquipe,
  usuariosDaBarbearia: readonly UsuarioEquipe[],
): boolean {
  // Só o dono ativo precisa de proteção: convidado e desativado não contam como dono ativo.
  if (usuario.papel !== "dono" || usuario.situacao !== "ativo") {
    return true;
  }
  return usuariosDaBarbearia.some(
    (outro) =>
      outro.id !== usuario.id &&
      outro.papel === "dono" &&
      outro.situacao === "ativo",
  );
}
