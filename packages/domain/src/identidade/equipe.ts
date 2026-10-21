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
  if (usuario.papel !== "dono") {
    return true;
  }
  return usuariosDaBarbearia.some(
    (outro) =>
      outro.id !== usuario.id &&
      outro.papel === "dono" &&
      outro.situacao === "ativo",
  );
}
