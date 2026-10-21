import { Erro, EuSaida, SessaoSaida } from "@barbearia/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  eventoSeguranca,
  tokenAcesso,
  usuario,
} from "../../src/db/schema/index.js";
import { hashToken } from "../../src/identidade/seguranca/tokens.js";
import { criarApp, type AppDeTeste } from "./helpers/app.js";
import { comTenantAdmin, fecharConexoes } from "./helpers/db.js";
import {
  criarBarbearia,
  criarTokenAcesso,
  criarUsuario,
} from "./helpers/fabrica.js";

const DIA = 24 * 60 * 60 * 1000;
const MENSAGEM_INVALIDO =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";
const CONVITE_INVALIDO = {
  codigo: "CONVITE_INVALIDO",
  mensagem: MENSAGEM_INVALIDO,
};

describe("convites e GET /auth/eu", () => {
  let t: AppDeTeste;
  let contador = 0;

  beforeAll(async () => {
    t = await criarApp();
  });

  afterAll(async () => {
    await t.fechar();
    await fecharConexoes();
  });

  async function conviteNovo(
    opcoes: {
      expiraEm?: Date;
      usadoEm?: Date;
      invalidadoEm?: Date;
      nomeBarbearia?: string;
      situacao?: "convidado" | "ativo";
    } = {},
  ) {
    contador += 1;
    const { barbeariaId: tenantId } = await criarBarbearia(
      opcoes.nomeBarbearia ?? `Convites ${String(contador)}`,
    );
    const email = `dono-conv-${String(contador)}@exemplo.com`;
    const usuarioId = await criarUsuario({
      tenantId,
      email,
      nome: "Ana Souza",
      papel: "dono",
      situacao: opcoes.situacao ?? "convidado",
    });
    const token = await criarTokenAcesso({
      tenantId,
      usuarioId,
      expiraEm:
        opcoes.expiraEm ?? new Date(t.relogio.agora().getTime() + 7 * DIA),
      usadoEm: opcoes.usadoEm ?? null,
      invalidadoEm: opcoes.invalidadoEm ?? null,
    });
    return { tenantId, usuarioId, email, token };
  }

  describe("GET /auth/convites/{token}", () => {
    it("devolve o nome do convidado e a barbearia", async () => {
      const c = await conviteNovo({ nomeBarbearia: "Barbearia do Convite" });
      const r = await t.http().get(`/auth/convites/${c.token}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        nome: "Ana Souza",
        barbearia: "Barbearia do Convite",
      });
    });

    it.each([
      ["inexistente", () => Promise.resolve("token-que-nao-existe")],
      ["usado", async () => (await conviteNovo({ usadoEm: new Date() })).token],
      [
        "invalidado",
        async () => (await conviteNovo({ invalidadoEm: new Date() })).token,
      ],
      [
        "expirado",
        async () =>
          (
            await conviteNovo({
              expiraEm: new Date(t.relogio.agora().getTime() - 1000),
            })
          ).token,
      ],
    ])("convite %s responde o mesmo 410", async (_nome, obter) => {
      const r = await t.http().get(`/auth/convites/${await obter()}`);
      expect(r.status).toBe(410);
      expect(r.body).toEqual(CONVITE_INVALIDO);
    });
  });

  describe("POST /auth/convites/aceitar", () => {
    it("web: ativa o usuário, usa o token, define o cookie e não devolve o token no corpo", async () => {
      const c = await conviteNovo();
      const r = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "cadeira-de-barbeiro", cliente: "web" });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        usuario: {
          id: c.usuarioId,
          nome: "Ana Souza",
          email: c.email,
          papel: "dono",
          situacao: "ativo",
          barbeariaId: c.tenantId,
        },
      });
      const cookie =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(cookie).toMatch(/^sessao=[A-Za-z0-9_%-]+;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");

      const estado = await comTenantAdmin(c.tenantId, async (tx) => ({
        usuarios: await tx.select().from(usuario),
        tokens: await tx.select().from(tokenAcesso),
        eventos: await tx.select().from(eventoSeguranca),
      }));
      expect(estado.usuarios[0]).toMatchObject({ situacao: "ativo" });
      expect(estado.usuarios[0]?.senhaHash).toMatch(/^\$argon2id\$/);
      expect(estado.tokens[0]?.usadoEm).toBeInstanceOf(Date);
      expect(estado.eventos).toMatchObject([
        {
          tipo: "convite_aceito",
          atorTipo: "usuario",
          atorUsuarioId: c.usuarioId,
        },
      ]);
    });

    it("mobile: devolve o token no corpo e não define cookie; o Bearer funciona", async () => {
      const c = await conviteNovo();
      const r = await t.http().post("/auth/convites/aceitar").send({
        token: c.token,
        senha: "cadeira-de-barbeiro",
        cliente: "mobile",
      });
      expect(r.status).toBe(200);
      expect(r.headers["set-cookie"]).toBeUndefined();
      const sessao = SessaoSaida.parse(r.body);
      expect(typeof sessao.token).toBe("string");
      const eu = await t
        .http()
        .get("/auth/eu")
        .set("Authorization", `Bearer ${sessao.token ?? ""}`);
      expect(eu.status).toBe(200);
      expect(EuSaida.parse(eu.body).usuario.id).toBe(c.usuarioId);
    });

    it("senha fraca responde 400 SENHA_FRACA com o motivo e não consome o convite", async () => {
      const c = await conviteNovo();
      const curta = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "abc123", cliente: "web" });
      expect(curta.status).toBe(400);
      const erroCurta = Erro.parse(curta.body);
      expect(erroCurta.codigo).toBe("SENHA_FRACA");
      expect(erroCurta.campos?.senha).toContain("8 caracteres");

      const comum = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "password123", cliente: "web" });
      expect(Erro.parse(comum.body).campos?.senha).toMatch(/comum/);

      const igualEmail = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: c.email, cliente: "web" });
      expect(Erro.parse(igualEmail.body).campos?.senha).toMatch(/e-mail/);

      const igualNome = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "ana souza", cliente: "web" });
      expect(Erro.parse(igualNome.body).campos?.senha).toMatch(/nome/);

      const ok = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "cadeira-de-barbeiro", cliente: "web" });
      expect(ok.status).toBe(200);
    });

    it("reutilizar o token responde 410", async () => {
      const c = await conviteNovo();
      await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "cadeira-de-barbeiro", cliente: "web" });
      const de_novo = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "outra-senha-boa", cliente: "web" });
      expect(de_novo.status).toBe(410);
      expect(de_novo.body).toEqual(CONVITE_INVALIDO);
    });

    it("convite expirado pelo relógio responde 410", async () => {
      const c = await conviteNovo();
      t.relogio.avancar(8 * DIA);
      const r = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token: c.token, senha: "cadeira-de-barbeiro", cliente: "web" });
      expect(r.status).toBe(410);
      t.relogio.avancar(-8 * DIA);
    });

    it("duas aceitações simultâneas do mesmo convite: só uma vale", async () => {
      const c = await conviteNovo();
      const corpo = {
        token: c.token,
        senha: "cadeira-de-barbeiro",
        cliente: "web",
      };
      const [a, b] = await Promise.all([
        t.http().post("/auth/convites/aceitar").send(corpo),
        t.http().post("/auth/convites/aceitar").send(corpo),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 410]);
    });

    it("dados inválidos respondem 400 DADOS_INVALIDOS com os campos", async () => {
      const r = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ senha: "x" });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        codigo: "DADOS_INVALIDOS",
        campos: { token: "Campo obrigatório.", cliente: "Campo obrigatório." },
      });
    });

    it("guarda só o hash do token do convite no banco", async () => {
      const c = await conviteNovo();
      const tokens = await comTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(tokenAcesso),
      );
      expect(tokens[0]?.tokenHash.equals(hashToken(c.token))).toBe(true);
    });
  });

  describe("GET /auth/eu", () => {
    it("sem sessão responde 401", async () => {
      expect((await t.http().get("/auth/eu")).status).toBe(401);
    });

    it("devolve só a própria barbearia, com a unidade inicial e o fuso", async () => {
      const a = await conviteNovo({
        nomeBarbearia: "Barbearia EU A",
        situacao: "ativo",
      });
      const b = await conviteNovo({
        nomeBarbearia: "Barbearia EU B",
        situacao: "ativo",
      });
      const tokenA = await t.abrirSessao({
        id: a.usuarioId,
        tenantId: a.tenantId,
        papel: "dono",
      });
      const r = await t
        .http()
        .get("/auth/eu")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(r.status).toBe(200);
      const eu = EuSaida.parse(r.body);
      expect(eu.usuario).toMatchObject({
        id: a.usuarioId,
        barbeariaId: a.tenantId,
        papel: "dono",
      });
      expect(eu.barbearia).toMatchObject({
        id: a.tenantId,
        nome: "Barbearia EU A",
      });
      expect(eu.barbearia.unidades).toHaveLength(1);
      expect(eu.barbearia.unidades[0]).toMatchObject({
        nome: "Matriz",
        fusoHorario: "America/Sao_Paulo",
      });
      expect(JSON.stringify(r.body)).not.toContain(b.tenantId);
      expect(JSON.stringify(r.body)).not.toContain("senha");
    });
  });
});
