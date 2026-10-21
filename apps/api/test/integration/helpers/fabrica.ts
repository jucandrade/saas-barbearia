import {
  barbearia,
  eventoSeguranca,
  sessao,
  tokenAcesso,
  unidade,
  usuario,
} from "../../../src/db/schema/index.js";
import {
  gerarToken,
  hashToken,
} from "../../../src/identidade/seguranca/tokens.js";
import { comTenantAdmin, conexaoAdmin, novoUuid } from "./db.js";

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

export interface TokenParaCriar {
  tenantId: string;
  usuarioId: string;
  finalidade?: "convite" | "recuperacao";
  expiraEm: Date;
  usadoEm?: Date | null;
  invalidadoEm?: Date | null;
}

/** Cria um token de acesso direto no banco e devolve o token em claro. */
export async function criarTokenAcesso(dados: TokenParaCriar): Promise<string> {
  const token = gerarToken();
  await comTenantAdmin(dados.tenantId, async (tx) => {
    await tx.insert(tokenAcesso).values({
      tenantId: dados.tenantId,
      usuarioId: dados.usuarioId,
      finalidade: dados.finalidade ?? "convite",
      tokenHash: hashToken(token),
      expiraEm: dados.expiraEm,
      usadoEm: dados.usadoEm ?? null,
      invalidadoEm: dados.invalidadoEm ?? null,
    });
  });
  return token;
}

/** Cria uma sessão direto no banco (sem passar pelo login) e devolve o token em claro. */
export async function criarSessaoNoBanco(dados: {
  tenantId: string;
  usuarioId: string;
  expiraEm?: Date;
}): Promise<string> {
  const token = gerarToken();
  await comTenantAdmin(dados.tenantId, async (tx) => {
    await tx.insert(sessao).values({
      tenantId: dados.tenantId,
      usuarioId: dados.usuarioId,
      tokenHash: hashToken(token),
      expiraEm: dados.expiraEm ?? new Date(Date.now() + 60 * 60 * 1000),
    });
  });
  return token;
}

/** Cria um evento de segurança direto no banco, para os testes de isolamento. */
export async function criarEventoNoBanco(
  tenantId: string | null,
): Promise<void> {
  if (tenantId === null) {
    await conexaoAdmin().query(
      "insert into evento_seguranca (tenant_id, tipo, ator_tipo) values (null, 'login_falha', 'sistema')",
    );
    return;
  }
  await comTenantAdmin(tenantId, async (tx) => {
    await tx.insert(eventoSeguranca).values({
      tenantId,
      tipo: "login_sucesso",
      atorTipo: "sistema",
    });
  });
}
