import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usuario } from "../../src/db/schema/index.js";
import {
  comTenantAdmin,
  conexaoAdmin,
  conexaoRuntime,
  conexaoSuper,
  fecharConexoes,
} from "./helpers/db.js";
import {
  criarBarbearia,
  criarEventoNoBanco,
  criarSessaoNoBanco,
  criarTokenAcesso,
  criarUsuario,
} from "./helpers/fabrica.js";

interface Tenant {
  barbeariaId: string;
  usuarioId: string;
}

/** Tabelas isoladas por tenant e a coluna que as liga ao dono (a própria `barbearia` usa `id`). */
const TABELAS = [
  { nome: "barbearia", coluna: "id" },
  { nome: "unidade", coluna: "tenant_id" },
  { nome: "usuario", coluna: "tenant_id" },
  { nome: "token_acesso", coluna: "tenant_id" },
  { nome: "sessao", coluna: "tenant_id" },
  { nome: "evento_seguranca", coluna: "tenant_id" },
] as const;

/** Executa dentro de uma transação com (ou sem) o contexto do tenant, sempre revertida no fim. */
async function como<T>(
  pool: typeof conexaoRuntime extends () => infer P ? P : never,
  tenantId: string | undefined,
  fn: (
    consultar: (
      sql: string,
    ) => Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>,
  ) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    if (tenantId !== undefined) {
      await cliente.query("select set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
    }
    return await fn((sql) => cliente.query(sql));
  } finally {
    await cliente.query("rollback").catch(() => undefined);
    cliente.release();
  }
}

/** Resultado de uma escrita: quantas linhas afetou ou o erro que o banco devolveu. */
async function tentar(
  pool: Parameters<typeof como>[0],
  tenantId: string | undefined,
  sql: string,
): Promise<{ afetadas: number } | { erro: string }> {
  try {
    return await como(pool, tenantId, async (consultar) => ({
      afetadas: (await consultar(sql)).rowCount ?? 0,
    }));
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

describe("RLS: isolamento por tenant no banco", () => {
  let a: Tenant;
  let b: Tenant;

  async function semear(nome: string): Promise<Tenant> {
    const { barbeariaId } = await criarBarbearia(nome);
    const usuarioId = await criarUsuario({
      tenantId: barbeariaId,
      papel: "dono",
    });
    await criarTokenAcesso({
      tenantId: barbeariaId,
      usuarioId,
      expiraEm: new Date(Date.now() + 60_000),
    });
    await criarSessaoNoBanco({ tenantId: barbeariaId, usuarioId });
    await criarEventoNoBanco(barbeariaId);
    return { barbeariaId, usuarioId };
  }

  beforeAll(async () => {
    a = await semear("RLS A");
    b = await semear("RLS B");
  });

  afterAll(fecharConexoes);

  describe.each(TABELAS)("tabela $nome", ({ nome, coluna }) => {
    it("a API, sem contexto de tenant, não lê nenhuma linha", async () => {
      const r = await como(conexaoRuntime(), undefined, (q) =>
        q(`select * from ${nome}`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("a API, com o contexto de A, lê só linhas de A e nenhuma de B", async () => {
      const r = await como(conexaoRuntime(), a.barbeariaId, (q) =>
        q(`select ${coluna} as dono from ${nome}`),
      );
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((l) => l["dono"] === a.barbeariaId)).toBe(true);
    });

    it("a API, com o contexto de A, não vê linha alguma de B nem por filtro explícito", async () => {
      const r = await como(conexaoRuntime(), a.barbeariaId, (q) =>
        q(`select * from ${nome} where ${coluna} = '${b.barbeariaId}'`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("a API não altera linhas de B (zero afetadas ou sem permissão)", async () => {
      const set =
        nome === "evento_seguranca"
          ? "tipo = 'logout'"
          : nome === "sessao"
            ? "revogada_em = now()"
            : nome === "token_acesso"
              ? "usado_em = now()"
              : nome === "usuario"
                ? "nome = 'x'"
                : nome === "unidade"
                  ? "nome = 'x'"
                  : "nome = 'x'";
      const r = await tentar(
        conexaoRuntime(),
        a.barbeariaId,
        `update ${nome} set ${set} where ${coluna} = '${b.barbeariaId}'`,
      );
      if ("erro" in r) {
        expect(r.erro).toMatch(
          /permission denied|row-level security|EVENTO_IMUTAVEL/i,
        );
      } else {
        expect(r.afetadas).toBe(0);
      }
    });

    it("a API nunca remove linhas (não tem DELETE em nenhuma tabela)", async () => {
      const r = await tentar(
        conexaoRuntime(),
        a.barbeariaId,
        `delete from ${nome}`,
      );
      expect(r).toHaveProperty("erro");
      expect("erro" in r && r.erro).toMatch(/permission denied/i);
    });

    it("o dono das tabelas (não superusuário), sem contexto, também não lê nada (FORCE)", async () => {
      const r = await como(conexaoAdmin(), undefined, (q) =>
        q(`select * from ${nome}`),
      );
      expect(r.rows).toHaveLength(0);
    });

    it("o dono das tabelas, com o contexto de A, lê só A", async () => {
      const r = await como(conexaoAdmin(), a.barbeariaId, (q) =>
        q(`select ${coluna} as dono from ${nome}`),
      );
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.every((l) => l["dono"] === a.barbeariaId)).toBe(true);
    });
  });

  describe("escrita cruzada", () => {
    const inserts: Record<
      string,
      (tenant: string, usuarioId: string) => string
    > = {
      usuario: (t) =>
        `insert into usuario (tenant_id, nome, email, papel, situacao) values ('${t}', 'Intruso', 'intruso-rls@exemplo.com', 'barbeiro', 'convidado')`,
      token_acesso: (t, u) =>
        `insert into token_acesso (tenant_id, usuario_id, finalidade, token_hash, expira_em) values ('${t}', '${u}', 'convite', decode('aa', 'hex'), now())`,
      sessao: (t, u) =>
        `insert into sessao (tenant_id, usuario_id, token_hash, expira_em) values ('${t}', '${u}', decode('bb', 'hex'), now())`,
      evento_seguranca: (t) =>
        `insert into evento_seguranca (tenant_id, tipo, ator_tipo) values ('${t}', 'logout', 'sistema')`,
    };

    it.each(Object.keys(inserts))(
      "o contexto de A não insere em %s com o tenant de B",
      async (tabela) => {
        const r = await tentar(
          conexaoRuntime(),
          a.barbeariaId,
          inserts[tabela]?.(b.barbeariaId, b.usuarioId) ?? "",
        );
        expect(r).toHaveProperty("erro");
        expect("erro" in r && r.erro).toMatch(
          /row-level security|violates foreign key/i,
        );
      },
    );

    it("sem contexto nada é inserido", async () => {
      for (const tabela of Object.keys(inserts)) {
        const r = await tentar(
          conexaoRuntime(),
          undefined,
          inserts[tabela]?.(a.barbeariaId, a.usuarioId) ?? "",
        );
        expect(r).toHaveProperty("erro");
      }
    });
  });

  describe("papéis do banco", () => {
    it("a API não é superusuário, não tem BYPASSRLS e não é dona de nenhuma tabela", async () => {
      const papel = await conexaoRuntime().query(
        "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
      );
      expect(papel.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
      const donas = await conexaoRuntime().query(
        "select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user",
      );
      expect(donas.rows[0]).toEqual({ n: 0 });
    });

    it("todas as tabelas têm RLS ligada e FORCE", async () => {
      const r = await conexaoSuper().query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "select relname, relrowsecurity, relforcerowsecurity from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and relname = any($1)",
        [TABELAS.map((t) => t.nome)],
      );
      expect(r.rows).toHaveLength(TABELAS.length);
      expect(
        r.rows.every((l) => l.relrowsecurity && l.relforcerowsecurity),
      ).toBe(true);
    });

    it("app_auth não tem login nem BYPASSRLS", async () => {
      const r = await conexaoSuper().query(
        "select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'app_auth'",
      );
      expect(r.rows[0]).toEqual({
        rolcanlogin: false,
        rolbypassrls: false,
        rolsuper: false,
      });
    });

    it("regressão: quem migra pode assumir app_auth mas NÃO herda a leitura irrestrita", async () => {
      // Políticas `TO app_auth` valem para quem herda o papel; herdá-lo furaria a RLS.
      const r = await conexaoSuper().query<{ herda: boolean }>(
        "select pg_has_role('owner_teste', 'app_auth', 'USAGE') as herda",
      );
      expect(r.rows[0]?.herda).toBe(false);
      const pode = await conexaoSuper().query<{ pode: boolean }>(
        "select pg_has_role('owner_teste', 'app_auth', 'SET') as pode",
      );
      expect(pode.rows[0]?.pode).toBe(true);
    });

    it("a API não herda app_auth", async () => {
      const r = await conexaoSuper().query<{ herda: boolean }>(
        "select pg_has_role('app_runtime', 'app_auth', 'USAGE') as herda",
      );
      expect(r.rows[0]?.herda).toBe(false);
    });
  });

  describe("funções de autenticação", () => {
    const FUNCOES = [
      "auth_buscar_usuario_por_email",
      "auth_buscar_sessao",
      "auth_buscar_token_acesso",
    ];

    it("pertencem a app_auth, são SECURITY DEFINER e fixam o search_path", async () => {
      const r = await conexaoSuper().query<{
        proname: string;
        dono: string;
        prosecdef: boolean;
        config: string[];
      }>(
        "select proname, pg_get_userbyid(proowner) as dono, prosecdef, proconfig as config from pg_proc where proname = any($1) order by proname",
        [FUNCOES],
      );
      expect(r.rows).toHaveLength(3);
      for (const f of r.rows) {
        expect(f.dono).toBe("app_auth");
        expect(f.prosecdef).toBe(true);
        expect(f.config.join(",")).toContain("search_path=pg_catalog, public");
      }
    });

    it("ninguém (PUBLIC) pode executá-las; só a API e quem migra", async () => {
      const r = await conexaoSuper().query<{
        proname: string;
        grantee: string;
      }>(
        `select p.proname, coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC') as grantee
         from pg_proc p, aclexplode(p.proacl) a
         where p.proname = any($1) and a.privilege_type = 'EXECUTE'`,
        [FUNCOES],
      );
      const grantees = new Set(r.rows.map((l) => l.grantee));
      expect(grantees.has("PUBLIC")).toBe(false);
      expect(grantees.has("app_runtime")).toBe(true);
      expect(grantees.has("owner_teste")).toBe(true);
      expect(
        [...grantees].every((g) =>
          ["app_runtime", "owner_teste", "app_auth"].includes(g),
        ),
      ).toBe(true);
    });

    it("as funções enxergam todos os tenants, mas só devolvem as colunas de autenticação", async () => {
      const { rows } = await conexaoRuntime().query(
        "select * from auth_buscar_usuario_por_email('inexistente@exemplo.com')",
      );
      expect(rows).toHaveLength(0);
      const colunas = await conexaoRuntime().query(
        "select * from auth_buscar_usuario_por_email((select email from usuario where false)) limit 0",
      );
      expect(colunas.fields.map((f) => f.name)).toEqual([
        "id",
        "tenant_id",
        "papel",
        "situacao",
        "senha_hash",
        "tentativas_falhas",
        "bloqueado_ate",
      ]);
    });
  });

  describe("trilha de auditoria imutável", () => {
    it("nem o dono das tabelas altera, remove ou trunca eventos", async () => {
      const contar = async () =>
        (
          await conexaoSuper().query<{ n: number }>(
            "select count(*)::int as n from evento_seguranca",
          )
        ).rows[0]?.n;
      const antes = await contar();
      // UPDATE e DELETE nem enxergam as linhas (a RLS não tem política para eles) ou caem no gatilho.
      for (const sql of [
        "update evento_seguranca set tipo = 'logout'",
        "delete from evento_seguranca",
      ]) {
        const r = await tentar(conexaoAdmin(), a.barbeariaId, sql);
        if ("erro" in r) {
          expect(r.erro).toMatch(/EVENTO_IMUTAVEL/);
        } else {
          expect(r.afetadas).toBe(0);
        }
      }
      // TRUNCATE ignora a RLS e cai direto no gatilho.
      const truncar = await tentar(
        conexaoAdmin(),
        a.barbeariaId,
        "truncate evento_seguranca",
      );
      expect("erro" in truncar && truncar.erro).toMatch(/EVENTO_IMUTAVEL/);
      expect(await contar()).toBe(antes);
    });

    it("a API não consegue alterar nem remover eventos (sem permissão)", async () => {
      for (const sql of [
        "update evento_seguranca set tipo = 'logout'",
        "delete from evento_seguranca",
      ]) {
        const r = await tentar(conexaoRuntime(), a.barbeariaId, sql);
        expect("erro" in r && r.erro).toMatch(/permission denied/i);
      }
    });

    it("eventos sem barbearia (tenant_id nulo) existem mas nenhuma barbearia os enxerga", async () => {
      await criarEventoNoBanco(null);
      const globais = await conexaoSuper().query<{ n: number }>(
        "select count(*)::int as n from evento_seguranca where tenant_id is null",
      );
      expect(globais.rows[0]?.n).toBeGreaterThan(0);
      for (const tenantId of [a.barbeariaId, b.barbeariaId]) {
        const r = await como(conexaoRuntime(), tenantId, (q) =>
          q("select * from evento_seguranca where tenant_id is null"),
        );
        expect(r.rows).toHaveLength(0);
      }
      const semContexto = await como(conexaoRuntime(), undefined, (q) =>
        q("select * from evento_seguranca"),
      );
      expect(semContexto.rows).toHaveLength(0);
    });
  });

  it("os dados semeados de A e B continuam intactos depois de todas as tentativas", async () => {
    for (const t of [a, b]) {
      const usuarios = await comTenantAdmin(t.barbeariaId, (tx) =>
        tx.select().from(usuario),
      );
      expect(usuarios).toHaveLength(1);
      expect(usuarios[0]?.nome).toBe("Usuário Teste");
    }
  });
});
