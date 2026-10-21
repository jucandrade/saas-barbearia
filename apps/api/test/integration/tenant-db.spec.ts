import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { barbearia, usuario } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { conexaoRuntime, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

/** O Drizzle embrulha o erro do Postgres em `cause`; junta as duas mensagens. */
async function mensagemDoErro(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    const causa = erro instanceof Error ? erro.cause : undefined;
    return [
      erro instanceof Error ? erro.message : String(erro),
      causa instanceof Error ? causa.message : "",
    ].join(" | ");
  }
  throw new Error("esperava uma falha, mas a operação teve sucesso");
}

describe("TenantDb", () => {
  let tenantDb: TenantDb;
  let a: { barbeariaId: string; usuarioId: string; email: string };
  let b: { barbeariaId: string; usuarioId: string; email: string };

  async function montar(nome: string, email: string) {
    const { barbeariaId } = await criarBarbearia(nome);
    const usuarioId = await criarUsuario({
      tenantId: barbeariaId,
      email,
      papel: "dono",
    });
    return { barbeariaId, usuarioId, email };
  }

  beforeAll(async () => {
    tenantDb = new TenantDb(conexaoRuntime());
    a = await montar("Barbearia A", "dono-a@exemplo.com");
    b = await montar("Barbearia B", "dono-b@exemplo.com");
  });

  afterAll(fecharConexoes);

  it("com o contexto de A, enxerga só linhas de A", async () => {
    const usuarios = await tenantDb.transacao(a.barbeariaId, (tx) =>
      tx.select({ id: usuario.id }).from(usuario),
    );
    expect(usuarios.map((u) => u.id)).toEqual([a.usuarioId]);

    const barbearias = await tenantDb.transacao(a.barbeariaId, (tx) =>
      tx.select({ id: barbearia.id }).from(barbearia),
    );
    expect(barbearias.map((x) => x.id)).toEqual([a.barbeariaId]);
  });

  it("sem contexto, SELECT devolve 0 linhas", async () => {
    const resultado = await conexaoRuntime().query("select id from usuario");
    expect(resultado.rowCount).toBe(0);
  });

  it("sem contexto, INSERT falha pela RLS", async () => {
    const mensagem = await mensagemDoErro(
      conexaoRuntime().query(
        "insert into usuario (tenant_id, nome, email, papel, situacao) values (gen_random_uuid(), 'X', 'x@exemplo.com', 'barbeiro', 'convidado')",
      ),
    );
    expect(mensagem).toMatch(/row-level security/i);
  });

  it("a API não tem permissão para criar barbearia (só a equipe do produto)", async () => {
    const mensagem = await mensagemDoErro(
      conexaoRuntime().query(
        "insert into barbearia (nome) values ('Sem permissão')",
      ),
    );
    expect(mensagem).toMatch(/permission denied/i);
  });

  it("o contexto de A não grava linha com o tenant de B", async () => {
    const mensagem = await mensagemDoErro(
      tenantDb.transacao(a.barbeariaId, (tx) =>
        tx.insert(usuario).values({
          tenantId: b.barbeariaId,
          nome: "Intruso",
          email: "intruso@exemplo.com",
          papel: "barbeiro",
          situacao: "convidado",
        }),
      ),
    );
    expect(mensagem).toMatch(/row-level security/i);
  });

  it("o contexto de A não altera linhas de B", async () => {
    const atualizadas = await tenantDb.transacao(a.barbeariaId, (tx) =>
      tx
        .update(usuario)
        .set({ nome: "Hackeado" })
        .returning({ id: usuario.id }),
    );
    expect(atualizadas.map((u) => u.id)).toEqual([a.usuarioId]);
    const doB = await tenantDb.transacao(b.barbeariaId, (tx) =>
      tx.select({ nome: usuario.nome }).from(usuario),
    );
    expect(doB[0]?.nome).toBe("Usuário Teste");
  });

  it("passa o tenant por parâmetro: valor malicioso é recusado e nada é executado", async () => {
    await expect(
      tenantDb.transacao("'; drop table usuario; --", (tx) =>
        tx.select().from(usuario),
      ),
    ).rejects.toThrow(/tenant/i);
    const existe = await conexaoRuntime().query(
      "select to_regclass('public.usuario') as tabela",
    );
    expect(existe.rows[0]).toEqual({ tabela: "usuario" });
  });

  it("o contexto vale só dentro da transação", async () => {
    await tenantDb.transacao(a.barbeariaId, async (tx) => {
      const { rows } = await tx.execute<{ valor: string }>(
        sql`select current_setting('app.tenant_id', true) as valor`,
      );
      expect(rows[0]?.valor).toBe(a.barbeariaId);
    });
    const { rows } = await conexaoRuntime().query<{ valor: string | null }>(
      "select nullif(current_setting('app.tenant_id', true), '') as valor",
    );
    expect(rows[0]?.valor).toBeNull();
  });

  describe("semTenant (funções de autenticação)", () => {
    it("acha o usuário por e-mail sem contexto, em qualquer barbearia", async () => {
      const doA = await tenantDb.semTenant().buscarUsuarioPorEmail(a.email);
      expect(doA).toMatchObject({
        id: a.usuarioId,
        tenantId: a.barbeariaId,
        papel: "dono",
        situacao: "ativo",
        tentativasFalhas: 0,
        bloqueadoAte: null,
      });
      const doB = await tenantDb.semTenant().buscarUsuarioPorEmail(b.email);
      expect(doB?.tenantId).toBe(b.barbeariaId);
    });

    it("devolve undefined para e-mail inexistente", async () => {
      expect(
        await tenantDb.semTenant().buscarUsuarioPorEmail("ninguem@exemplo.com"),
      ).toBeUndefined();
    });

    it("só expõe as três funções de autenticação", () => {
      const metodos = Object.getOwnPropertyNames(
        Object.getPrototypeOf(tenantDb.semTenant()),
      ).sort();
      expect(metodos).toEqual([
        "buscarSessao",
        "buscarTokenAcesso",
        "buscarUsuarioPorEmail",
        "constructor",
      ]);
    });
  });
});
