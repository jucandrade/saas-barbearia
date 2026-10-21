import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Erro, EuSaida, SessaoSaida } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { eventoSeguranca, usuario } from "../../src/db/schema/index.js";
import { SenhaService } from "../../src/identidade/seguranca/senha.service.js";
import { criarApp, ORIGEM_ADMIN, type AppDeTeste } from "./helpers/app.js";
import { comTenantAdmin, conexaoSuper, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

const SENHA = "cadeira-de-barbeiro";
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const MINUTO = 60 * 1000;
const CREDENCIAIS_INVALIDAS = {
  codigo: "CREDENCIAIS_INVALIDAS",
  mensagem: "E-mail ou senha incorretos, ou acesso temporariamente bloqueado.",
};

describe("POST /auth/login e /auth/logout", () => {
  let t: AppDeTeste;
  let hash: string;
  let contador = 0;

  beforeAll(async () => {
    t = await criarApp();
    hash = await t.app.get(SenhaService).hash(SENHA);
  });

  afterAll(async () => {
    await t.fechar();
    await fecharConexoes();
  });

  async function conta(
    opcoes: {
      papel?: "dono" | "barbeiro";
      situacao?: "convidado" | "ativo" | "desativado";
    } = {},
  ) {
    contador += 1;
    const { barbeariaId: tenantId } = await criarBarbearia(
      `Auth ${String(contador)}`,
    );
    const situacao = opcoes.situacao ?? "ativo";
    const email = `conta-auth-${String(contador)}@exemplo.com`;
    const id = await criarUsuario({
      tenantId,
      email,
      nome: "Ana Souza",
      papel: opcoes.papel ?? "barbeiro",
      situacao,
      senhaHash: situacao === "convidado" ? null : hash,
    });
    return { id, tenantId, email };
  }

  const entrar = (
    email: string,
    senha: string,
    cliente: "web" | "mobile" = "web",
  ) => t.http().post("/auth/login").send({ email, senha, cliente });

  const estadoNoBanco = async (c: { id: string; tenantId: string }) => {
    const [u] = await comTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(usuario).where(eq(usuario.id, c.id)),
    );
    return u;
  };

  describe("login com sucesso", () => {
    it("web: define o cookie HttpOnly e não devolve o token no corpo", async () => {
      const c = await conta({ papel: "dono" });
      const r = await entrar(c.email, SENHA, "web");
      expect(r.status).toBe(200);
      const sessao = SessaoSaida.parse(r.body);
      expect(sessao.token).toBeUndefined();
      expect(sessao.usuario).toMatchObject({
        id: c.id,
        papel: "dono",
        situacao: "ativo",
        barbeariaId: c.tenantId,
      });
      const cookie =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(cookie).toMatch(/^sessao=[A-Za-z0-9_%-]+;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");

      const eu = await t
        .http()
        .get("/auth/eu")
        .set("Cookie", cookie.split(";")[0] ?? "");
      expect(EuSaida.parse(eu.body).usuario.id).toBe(c.id);
    });

    it("mobile: devolve o token no corpo e não define cookie; o Bearer funciona", async () => {
      const c = await conta();
      const r = await entrar(c.email, SENHA, "mobile");
      expect(r.status).toBe(200);
      expect(r.headers["set-cookie"]).toBeUndefined();
      const sessao = SessaoSaida.parse(r.body);
      const eu = await t
        .http()
        .get("/auth/eu")
        .set("Authorization", `Bearer ${sessao.token ?? ""}`);
      expect(eu.status).toBe(200);
    });

    it("aceita o e-mail com maiúsculas e espaços", async () => {
      const c = await conta();
      expect((await entrar(`  ${c.email.toUpperCase()} `, SENHA)).status).toBe(
        200,
      );
    });

    it("dados malformados respondem 400 DADOS_INVALIDOS, sem revelar nada sobre a conta", async () => {
      const r = await t
        .http()
        .post("/auth/login")
        .send({ email: "nao-e-email", senha: "x", cliente: "web" });
      expect(r.status).toBe(400);
      expect(Erro.parse(r.body).codigo).toBe("DADOS_INVALIDOS");
    });
  });

  describe("logout", () => {
    it("revoga a sessão: o mesmo token passa a dar 401", async () => {
      const c = await conta();
      const { token } = SessaoSaida.parse(
        (await entrar(c.email, SENHA, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(200);
      expect((await t.http().post("/auth/logout").set(auth)).status).toBe(204);
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(401);
    });

    it("web: limpa o cookie e exige a origem do admin", async () => {
      const c = await conta();
      const login = await entrar(c.email, SENHA, "web");
      const cookie =
        ((login.headers["set-cookie"] as unknown as string[])[0] ?? "").split(
          ";",
        )[0] ?? "";

      expect(
        (await t.http().post("/auth/logout").set("Cookie", cookie)).status,
      ).toBe(403);
      const r = await t
        .http()
        .post("/auth/logout")
        .set("Cookie", cookie)
        .set("Origin", ORIGEM_ADMIN);
      expect(r.status).toBe(204);
      const limpo =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(limpo).toContain("sessao=;");
      expect(limpo).toContain("Max-Age=0");
      expect(
        (await t.http().get("/auth/eu").set("Cookie", cookie)).status,
      ).toBe(401);
    });

    it("sem sessão responde 401", async () => {
      expect((await t.http().post("/auth/logout")).status).toBe(401);
    });
  });

  describe("falhas indistinguíveis (FR-014, SC-005)", () => {
    it("e-mail inexistente, senha errada, convidado, desativado e bloqueada respondem o mesmo 401", async () => {
      const ativa = await conta();
      const convidado = await conta({ situacao: "convidado" });
      const desativado = await conta({ situacao: "desativado" });
      const bloqueada = await conta();
      for (let i = 0; i < 5; i += 1) {
        await entrar(bloqueada.email, "senha-errada");
      }

      const respostas = [
        await entrar("ninguem-auth@exemplo.com", SENHA),
        await entrar(ativa.email, "senha-errada"),
        await entrar(convidado.email, SENHA),
        await entrar(desativado.email, SENHA),
        await entrar(bloqueada.email, SENHA), // senha CERTA, mas a conta está bloqueada
      ];
      for (const r of respostas) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual(CREDENCIAIS_INVALIDAS);
        expect(r.headers["set-cookie"]).toBeUndefined();
      }
    });

    it("e-mail inexistente também gasta o tempo de uma verificação de senha", async () => {
      const espiao = vi.spyOn(
        t.app.get(SenhaService),
        "verificarSenhaFicticia",
      );
      await entrar("nunca-existiu@exemplo.com", SENHA);
      expect(espiao).toHaveBeenCalledOnce();
      espiao.mockRestore();
    });
  });

  describe("bloqueio por conta (FR-015)", () => {
    it("a 5ª falha seguida bloqueia por 15 minutos; depois libera e o sucesso zera o contador", async () => {
      const c = await conta();
      for (let i = 0; i < 4; i += 1) {
        await entrar(c.email, "errada");
      }
      expect((await estadoNoBanco(c))?.tentativasFalhas).toBe(4);
      await entrar(c.email, "errada");
      const bloqueada = await estadoNoBanco(c);
      expect(bloqueada?.tentativasFalhas).toBe(5);
      expect(bloqueada?.bloqueadoAte).toEqual(
        new Date(t.relogio.agora().getTime() + 15 * MINUTO),
      );

      t.relogio.avancar(14 * MINUTO);
      expect((await entrar(c.email, SENHA)).status).toBe(401);
      t.relogio.avancar(2 * MINUTO);
      expect((await entrar(c.email, SENHA)).status).toBe(200);
      const livre = await estadoNoBanco(c);
      expect(livre?.tentativasFalhas).toBe(0);
      expect(livre?.bloqueadoAte).toBeNull();
    });

    it("um login válido no meio zera as falhas anteriores", async () => {
      const c = await conta();
      await entrar(c.email, "errada");
      await entrar(c.email, "errada");
      expect((await entrar(c.email, SENHA)).status).toBe(200);
      expect((await estadoNoBanco(c))?.tentativasFalhas).toBe(0);
    });

    it("tentativas durante o bloqueio não o estendem", async () => {
      const c = await conta();
      for (let i = 0; i < 5; i += 1) {
        await entrar(c.email, "errada");
      }
      const antes = (await estadoNoBanco(c))?.bloqueadoAte;
      t.relogio.avancar(5 * MINUTO);
      await entrar(c.email, "errada");
      expect((await estadoNoBanco(c))?.bloqueadoAte).toEqual(antes);
      t.relogio.avancar(-5 * MINUTO);
    });

    it("tentativas simultâneas não furam o contador (a conta é travada durante a verificação)", async () => {
      const c = await conta();
      await Promise.all(
        Array.from({ length: 8 }, () => entrar(c.email, "errada")),
      );
      const u = await estadoNoBanco(c);
      expect(u?.tentativasFalhas).toBe(5);
      expect(u?.bloqueadoAte).not.toBeNull();
    });
  });

  describe("expiração da sessão por papel (FR-013)", () => {
    it("dono: 12 horas de inatividade", async () => {
      const c = await conta({ papel: "dono" });
      const { token } = SessaoSaida.parse(
        (await entrar(c.email, SENHA, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      t.relogio.avancar(12 * HORA - MINUTO);
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(200);
      t.relogio.avancar(12 * HORA + MINUTO);
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(401);
    });

    it("barbeiro: 30 dias de inatividade", async () => {
      const c = await conta({ papel: "barbeiro" });
      const { token } = SessaoSaida.parse(
        (await entrar(c.email, SENHA, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      t.relogio.avancar(29 * DIA);
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(200);
      t.relogio.avancar(31 * DIA);
      expect((await t.http().get("/auth/eu").set(auth)).status).toBe(401);
    });
  });

  describe("trilha de auditoria (FR-020)", () => {
    it("registra login_sucesso, login_falha e logout sem e-mail, nome, senha, token nem IP", async () => {
      const c = await conta();
      await entrar(c.email, "errada");
      const login = await entrar(c.email, SENHA, "mobile");
      const { token } = SessaoSaida.parse(login.body);
      await t
        .http()
        .post("/auth/logout")
        .set("Authorization", `Bearer ${token ?? ""}`);

      const eventos = await comTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(eventoSeguranca),
      );
      expect(eventos.map((e) => e.tipo).sort()).toEqual([
        "login_falha",
        "login_sucesso",
        "logout",
      ]);
      expect(
        eventos.every(
          (e) => e.atorUsuarioId === c.id && e.atorTipo === "usuario",
        ),
      ).toBe(true);
      const texto = JSON.stringify(eventos);
      for (const proibido of [
        c.email,
        "Ana Souza",
        SENHA,
        "errada",
        token ?? "x",
        "127.0.0.1",
        "::1",
      ]) {
        expect(texto).not.toContain(proibido);
      }
    });

    it("falha de e-mail inexistente vira evento sem barbearia, invisível para qualquer tenant", async () => {
      const antes = await conexaoSuper().query<{ n: number }>(
        "select count(*)::int as n from evento_seguranca where tenant_id is null and tipo = 'login_falha'",
      );
      await entrar("fantasma-auth@exemplo.com", SENHA);
      const depois = await conexaoSuper().query<{ n: number }>(
        "select count(*)::int as n from evento_seguranca where tenant_id is null and tipo = 'login_falha'",
      );
      expect((depois.rows[0]?.n ?? 0) - (antes.rows[0]?.n ?? 0)).toBe(1);
    });
  });
});

describe("limite por origem (FR-015)", () => {
  let t: AppDeTeste;

  beforeAll(async () => {
    t = await criarApp({ limitePorMinuto: 3 });
  });

  afterAll(async () => {
    await t.fechar();
    await fecharConexoes();
  });

  it("acima de 3 tentativas por minuto do mesmo IP o login responde 429 com Retry-After", async () => {
    const tentar = () =>
      t
        .http()
        .post("/auth/login")
        .send({ email: "x@exemplo.com", senha: "y", cliente: "web" });
    for (let i = 0; i < 3; i += 1) {
      expect((await tentar()).status).toBe(401);
    }
    const r = await tentar();
    expect(r.status).toBe(429);
    expect(Erro.parse(r.body).codigo).toBe("MUITAS_REQUISICOES");
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("o limite não vale para rotas protegidas", async () => {
    const { barbeariaId: tenantId } = await criarBarbearia("Sem limite");
    const id = await criarUsuario({ tenantId, papel: "dono" });
    const token = await t.abrirSessao({ id, tenantId, papel: "dono" });
    for (let i = 0; i < 6; i += 1) {
      expect(
        (await t.http().get("/auth/eu").set("Authorization", `Bearer ${token}`))
          .status,
      ).toBe(200);
    }
  });
});
