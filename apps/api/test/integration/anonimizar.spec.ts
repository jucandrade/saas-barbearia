import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { executarCli } from "../../src/cli/comandos.js";
import {
  eventoSeguranca,
  sessao,
  tokenAcesso,
  usuario,
} from "../../src/db/schema/index.js";
import { ErroPlataforma } from "../../src/identidade/provisionamento/erro-plataforma.js";
import { comTenantAdmin, conexaoSuper, fecharConexoes } from "./helpers/db.js";
import {
  criarBarbearia,
  criarEventoNoBanco,
  criarSessaoNoBanco,
  criarTokenAcesso,
  criarUsuario,
} from "./helpers/fabrica.js";
import { criarFerramentasDePlataforma } from "./helpers/plataforma.js";

let n = 0;

/** Barbearia com um dono ativo e um barbeiro desativado, pronto para ser anonimizado. */
async function cenario(opcoes: { desativar?: boolean } = {}) {
  n += 1;
  const { barbeariaId: tenantId } = await criarBarbearia(
    `Anonimiza ${String(n)}`,
  );
  await criarUsuario({
    tenantId,
    papel: "dono",
    email: `dono-anon-${String(n)}@exemplo.com`,
  });
  const email = `pessoa-anon-${String(n)}@exemplo.com`;
  const nome = `Pessoa Anon ${String(n)}`;
  const id = await criarUsuario({
    tenantId,
    papel: "barbeiro",
    email,
    nome,
    situacao: opcoes.desativar === false ? "ativo" : "desativado",
  });
  await criarSessaoNoBanco({ tenantId, usuarioId: id });
  await criarTokenAcesso({
    tenantId,
    usuarioId: id,
    expiraEm: new Date(Date.now() + 60_000),
  });
  await criarEventoNoBanco(tenantId);
  return { tenantId, id, email, nome };
}

const estado = (tenantId: string, id: string) =>
  comTenantAdmin(tenantId, async (tx) => ({
    usuario: (await tx.select().from(usuario).where(eq(usuario.id, id)))[0],
    sessoes: await tx.select().from(sessao).where(eq(sessao.usuarioId, id)),
    tokens: await tx
      .select()
      .from(tokenAcesso)
      .where(eq(tokenAcesso.usuarioId, id)),
  }));

describe("anonimizar-usuario", () => {
  afterAll(fecharConexoes);

  it("anonimiza nome e e-mail, apaga a senha, revoga sessões e tokens e marca a situação", async () => {
    const f = criarFerramentasDePlataforma();
    const c = await cenario();
    const r = await f.anonimizacao.anonimizar({ email: c.email });
    expect(r).toEqual({ usuarioId: c.id, jaAnonimizado: false });

    const depois = await estado(c.tenantId, c.id);
    expect(depois.usuario).toMatchObject({
      nome: "Usuário anonimizado",
      email: `anonimizado-${c.id}@invalid`,
      senhaHash: null,
      situacao: "anonimizado",
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    expect(depois.usuario?.anonimizadoEm).toBeInstanceOf(Date);
    expect(depois.sessoes.every((s) => s.revogadaEm !== null)).toBe(true);
    expect(
      depois.tokens.every((t) => t.usadoEm !== null || t.invalidadoEm !== null),
    ).toBe(true);
  });

  it("recusa usuário que não está desativado, com a orientação de desativar antes", async () => {
    const f = criarFerramentasDePlataforma();
    const c = await cenario({ desativar: false });
    await expect(f.anonimizacao.anonimizar({ email: c.email })).rejects.toThrow(
      /desativ/i,
    );
    expect((await estado(c.tenantId, c.id)).usuario?.situacao).toBe("ativo");
  });

  it("recusa o último dono ativo da barbearia", async () => {
    const f = criarFerramentasDePlataforma();
    const { barbeariaId: tenantId } = await criarBarbearia(
      "Anonimiza último dono",
    );
    const email = "unico-dono-anon@exemplo.com";
    const id = await criarUsuario({
      tenantId,
      papel: "dono",
      email,
      situacao: "ativo",
    });
    await expect(f.anonimizacao.anonimizar({ email })).rejects.toBeInstanceOf(
      ErroPlataforma,
    );
    expect((await estado(tenantId, id)).usuario).toMatchObject({
      situacao: "ativo",
      email,
    });
  });

  it("e-mail inexistente falha com orientação", async () => {
    const f = criarFerramentasDePlataforma();
    await expect(
      f.anonimizacao.anonimizar({ email: "ninguem-anon@exemplo.com" }),
    ).rejects.toBeInstanceOf(ErroPlataforma);
  });

  it("é idempotente: repetir com o e-mail anonimizado termina sem erro e sem novo evento", async () => {
    const f = criarFerramentasDePlataforma();
    const c = await cenario();
    await f.anonimizacao.anonimizar({ email: c.email });
    const r = await f.anonimizacao.anonimizar({
      email: `anonimizado-${c.id}@invalid`,
    });
    expect(r).toEqual({ usuarioId: c.id, jaAnonimizado: true });
    const eventos = await comTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    expect(
      eventos.filter((e) => e.tipo === "usuario_anonimizado"),
    ).toHaveLength(1);
  });

  it("o e-mail original fica livre para um novo cadastro", async () => {
    const f = criarFerramentasDePlataforma();
    const c = await cenario();
    await f.anonimizacao.anonimizar({ email: c.email });
    expect(
      await f.tenantDb.semTenant().buscarUsuarioPorEmail(c.email),
    ).toBeUndefined();
    const { barbeariaId } = await criarBarbearia("Reusa e-mail");
    await expect(
      criarUsuario({ tenantId: barbeariaId, email: c.email }),
    ).resolves.toBeTypeOf("string");
  });

  it("os eventos anteriores continuam na trilha, ligados só ao id, sem nome nem e-mail (SC-008)", async () => {
    const f = criarFerramentasDePlataforma();
    const c = await cenario();
    await comTenantAdmin(c.tenantId, (tx) =>
      tx.insert(eventoSeguranca).values({
        tenantId: c.tenantId,
        tipo: "login_sucesso",
        atorTipo: "usuario",
        atorUsuarioId: c.id,
        alvoUsuarioId: c.id,
      }),
    );
    await f.anonimizacao.anonimizar({ email: c.email });

    const eventos = await comTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    expect(
      eventos.some(
        (e) => e.tipo === "login_sucesso" && e.atorUsuarioId === c.id,
      ),
    ).toBe(true);
    const anon = eventos.find((e) => e.tipo === "usuario_anonimizado");
    expect(anon).toMatchObject({
      atorTipo: "plataforma",
      atorUsuarioId: null,
      alvoUsuarioId: c.id,
    });

    // Em nenhuma tabela do banco sobra o nome ou o e-mail originais.
    for (const tabela of [
      "usuario",
      "evento_seguranca",
      "sessao",
      "token_acesso",
      "barbearia",
      "unidade",
    ]) {
      const { rows } = await conexaoSuper().query<{ n: number }>(
        `select count(*)::int as n from ${tabela} t where to_jsonb(t)::text like $1 or to_jsonb(t)::text like $2`,
        [`%${c.email}%`, `%${c.nome}%`],
      );
      expect(rows[0]?.n, `tabela ${tabela}`).toBe(0);
    }
  });

  describe("comando", () => {
    const io = () => {
      const saida: string[] = [];
      const erro: string[] = [];
      return {
        saida,
        erro,
        io: {
          out: (m: string) => saida.push(m),
          err: (m: string) => erro.push(m),
        },
      };
    };

    it("sai com código 0 e identifica o usuário só pelo id, nunca pelo e-mail", async () => {
      const f = criarFerramentasDePlataforma();
      const c = await cenario();
      const saida = io();
      expect(
        await executarCli(
          ["anonimizar-usuario", "--email", c.email],
          f,
          saida.io,
        ),
      ).toBe(0);
      const texto = [...saida.saida, ...saida.erro].join("\n");
      expect(texto).toContain(c.id);
      expect(texto).not.toContain(c.email);
      expect(texto).not.toContain(c.nome);
    });

    it("repetir com o e-mail anonimizado sai com código 0", async () => {
      const f = criarFerramentasDePlataforma();
      const c = await cenario();
      await executarCli(["anonimizar-usuario", "--email", c.email], f, io().io);
      expect(
        await executarCli(
          ["anonimizar-usuario", "--email", `anonimizado-${c.id}@invalid`],
          f,
          io().io,
        ),
      ).toBe(0);
    });

    it("usuário ativo sai com código ≠ 0 e pede para desativar antes", async () => {
      const f = criarFerramentasDePlataforma();
      const c = await cenario({ desativar: false });
      const saida = io();
      expect(
        await executarCli(
          ["anonimizar-usuario", "--email", c.email],
          f,
          saida.io,
        ),
      ).not.toBe(0);
      expect(saida.erro.join("\n")).toMatch(/desativ/i);
      expect(saida.erro.join("\n")).not.toContain(c.email);
    });

    it("sem --email sai com código ≠ 0", async () => {
      const f = criarFerramentasDePlataforma();
      expect(await executarCli(["anonimizar-usuario"], f, io().io)).not.toBe(0);
    });
  });
});
