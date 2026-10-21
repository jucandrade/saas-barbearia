import { barbearia, unidade, usuario } from "../../../src/db/schema/index.js";
import { comTenantAdmin, novoUuid } from "./db.js";

export interface BarbeariaCriada {
  barbeariaId: string;
  unidadeId: string;
}

/** Cria barbearia e unidade inicial (o UUID nasce na aplicação, antes dos INSERT). */
export async function criarBarbearia(
  nome = "Barbearia Teste",
  fuso = "America/Sao_Paulo",
): Promise<BarbeariaCriada> {
  const barbeariaId = novoUuid();
  const unidadeId = novoUuid();
  await comTenantAdmin(barbeariaId, async (tx) => {
    await tx.insert(barbearia).values({ id: barbeariaId, nome });
    await tx.insert(unidade).values({
      id: unidadeId,
      tenantId: barbeariaId,
      nome: "Matriz",
      fusoHorario: fuso,
    });
  });
  return { barbeariaId, unidadeId };
}

export interface UsuarioParaCriar {
  tenantId: string;
  nome?: string;
  email?: string;
  papel?: "dono" | "barbeiro";
  situacao?: "convidado" | "ativo" | "desativado";
  senhaHash?: string | null;
}

export async function criarUsuario(dados: UsuarioParaCriar): Promise<string> {
  const id = novoUuid();
  const situacao = dados.situacao ?? "ativo";
  await comTenantAdmin(dados.tenantId, async (tx) => {
    await tx.insert(usuario).values({
      id,
      tenantId: dados.tenantId,
      nome: dados.nome ?? "Usuário Teste",
      email: dados.email ?? `${id}@exemplo.com`,
      papel: dados.papel ?? "barbeiro",
      situacao,
      senhaHash:
        dados.senhaHash === undefined
          ? situacao === "ativo" || situacao === "desativado"
            ? "hash-de-teste"
            : null
          : dados.senhaHash,
    });
  });
  return id;
}
