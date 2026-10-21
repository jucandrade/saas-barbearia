import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConvidarSaida,
  EquipeSaida,
  Erro,
  ReenviarSaida,
  SessaoSaida,
} from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { eventoSeguranca, usuario } from "../../src/db/schema/index.js";
import { SenhaService } from "../../src/identidade/seguranca/senha.service.js";
import { criarApp, type AppDeTeste } from "./helpers/app.js";
import { comTenantAdmin, conexaoAdmin, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";
import { tokenDoConvite } from "./helpers/plataforma.js";

const SENHA = "cadeira-de-barbeiro";
const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

describe("equipe (papel dono)", () => {
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

  interface Conta {
    id: string;
    email: string;
    auth: { Authorization: string };
  }

  /** Cria uma conta ativa já com sessão aberta. */
  async function conta(
    tenantId: string,
    papel: "dono" | "barbeiro",
    nome = "Pessoa Teste",
  ): Promise<Conta> {
    contador += 1;
    const email = `equipe-${String(contador)}@exemplo.com`;
    const id = await criarUsuario({
      tenantId,
      nome,
      email,
      papel,
      situacao: "ativo",
      senhaHash: hash,
    });
    const token = await t.abrirSessao({ id, tenantId, papel });
    return { id, email, auth: { Authorization: `Bearer ${token}` } };
  }

  async function barbearia(nome: string) {
    const { barbeariaId: tenantId } = await criarBarbearia(
      `${nome} ${String(contador + 1)}`,
    );
    const dono = await conta(tenantId, "dono", "Dona Ana");
    const barbeiro = await conta(tenantId, "barbeiro", "Bia Barbeira");
    return { tenantId, dono, barbeiro };
  }

  const eventosDe = (tenantId: string) =>
    comTenantAdmin(tenantId, (tx) => tx.select().from(eventoSeguranca));

  describe("permissão", () => {
    it("barbeiro recebe 403 SEM_PERMISSAO em todas as rotas de equipe", async () => {
      const { barbeiro, dono } = await barbearia("Permissão");
      const rotas = [
        () => t.http().get("/equipe"),
        () =>
          t
            .http()
            .post("/equipe/convites")
            .send({ nome: "X", email: "x@exemplo.com", papel: "barbeiro" }),
        () => t.http().post(`/equipe/${dono.id}/reenviar-convite`),
        () => t.http().post(`/equipe/${dono.id}/desativar`),
        () => t.http().post(`/equipe/${dono.id}/reativar`),
      ];
      for (const criar of rotas) {
        const r = await criar().set(barbeiro.auth);
        expect(r.status).toBe(403);
        expect(Erro.parse(r.body).codigo).toBe("SEM_PERMISSAO");
      }
    });

    it("sem sessão responde 401", async () => {
      expect((await t.http().get("/equipe")).status).toBe(401);
    });
  });

  describe("GET /equipe", () => {
    it("lista só a própria barbearia, ordenada por nome, sem anonimizados", async () => {
      const a = await barbearia("Lista A");
      const b = await barbearia("Lista B");
      await comTenantAdmin(a.tenantId, (tx) =>
        tx.insert(usuario).values({
          tenantId: a.tenantId,
          nome: "Usuário anonimizado",
          email: `anon-${String(contador)}@invalid`,
          papel: "barbeiro",
          situacao: "anonimizado",
          anonimizadoEm: new Date(),
        }),
      );
      const r = await t.http().get("/equipe").set(a.dono.auth);
      expect(r.status).toBe(200);
      const { usuarios } = EquipeSaida.parse(r.body);
      expect(usuarios.map((u) => u.id).sort()).toEqual(
        [a.dono.id, a.barbeiro.id].sort(),
      );
      expect(usuarios.map((u) => u.nome)).toEqual(["Bia Barbeira", "Dona Ana"]);
      expect(JSON.stringify(r.body)).not.toContain(b.dono.id);
      expect(JSON.stringify(r.body)).not.toContain("senha");
    });
  });

  describe("POST /equipe/convites", () => {
    it("convida um barbeiro: cria como convidado, envia o e-mail e registra o evento", async () => {
      const { tenantId, dono } = await barbearia("Convida");
      const r = await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Caio Corte",
        email: "  Caio.Equipe@Exemplo.com ",
        papel: "barbeiro",
      });
      expect(r.status).toBe(201);
      const saida = ConvidarSaida.parse(r.body);
      expect(saida.conviteEnviado).toBe(true);
      expect(saida.usuario).toMatchObject({
        nome: "Caio Corte",
        email: "caio.equipe@exemplo.com",
        papel: "barbeiro",
        situacao: "convidado",
        barbeariaId: tenantId,
      });

      const mensagem = t.email.ultimaPara("caio.equipe@exemplo.com");
      expect(mensagem?.texto).toContain("/convite/");

      const eventos = (await eventosDe(tenantId)).filter(
        (e) => e.tipo === "convite_enviado",
      );
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({
        atorUsuarioId: dono.id,
        alvoUsuarioId: saida.usuario.id,
        atorTipo: "usuario",
      });
      expect(JSON.stringify(eventos)).not.toContain("caio.equipe@exemplo.com");
    });

    it("o convidado aceita o convite e passa a entrar", async () => {
      const { dono } = await barbearia("Aceita");
      await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Dani",
        email: "dani-equipe@exemplo.com",
        papel: "barbeiro",
      });
      const token = tokenDoConvite(
        t.email.ultimaPara("dani-equipe@exemplo.com")?.texto ?? "",
      );
      const aceite = await t
        .http()
        .post("/auth/convites/aceitar")
        .send({ token, senha: SENHA, cliente: "mobile" });
      expect(aceite.status).toBe(200);
      expect(SessaoSaida.parse(aceite.body).usuario.papel).toBe("barbeiro");
    });

    it("um dono pode convidar outro dono; o papel é definido no convite e não muda depois", async () => {
      const { tenantId, dono } = await barbearia("Sócio");
      const r = await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Sócio Dono",
        email: "socio-equipe@exemplo.com",
        papel: "dono",
      });
      expect(r.status).toBe(201);
      const id = ConvidarSaida.parse(r.body).usuario.id;
      expect(ConvidarSaida.parse(r.body).usuario.papel).toBe("dono");

      await expect(
        comTenantAdmin(tenantId, (tx) =>
          tx
            .update(usuario)
            .set({ papel: "barbeiro" })
            .where(eq(usuario.id, id)),
        ),
      ).rejects.toThrow();
      const [depois] = await comTenantAdmin(tenantId, (tx) =>
        tx.select().from(usuario).where(eq(usuario.id, id)),
      );
      expect(depois?.papel).toBe("dono");
    });

    it("e-mail já usado em QUALQUER barbearia responde o mesmo 409 EMAIL_INDISPONIVEL", async () => {
      const a = await barbearia("Duplicado A");
      const b = await barbearia("Duplicado B");
      const naPropria = await t
        .http()
        .post("/equipe/convites")
        .set(a.dono.auth)
        .send({ nome: "X", email: a.barbeiro.email, papel: "barbeiro" });
      const naOutra = await t
        .http()
        .post("/equipe/convites")
        .set(a.dono.auth)
        .send({ nome: "X", email: b.barbeiro.email, papel: "barbeiro" });
      expect(naPropria.status).toBe(409);
      expect(naOutra.status).toBe(409);
      expect(naOutra.body).toEqual(naPropria.body);
      expect(Erro.parse(naPropria.body).codigo).toBe("EMAIL_INDISPONIVEL");
    });

    it("se o envio do e-mail falhar, o usuário e o convite ficam criados e conviteEnviado é false", async () => {
      const { dono } = await barbearia("Falha SMTP");
      t.email.falharProximo = true;
      const r = await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Eva",
        email: "eva-equipe@exemplo.com",
        papel: "barbeiro",
      });
      expect(r.status).toBe(201);
      expect(ConvidarSaida.parse(r.body).conviteEnviado).toBe(false);
      const lista = EquipeSaida.parse(
        (await t.http().get("/equipe").set(dono.auth)).body,
      );
      expect(
        lista.usuarios.some((u) => u.email === "eva-equipe@exemplo.com"),
      ).toBe(true);
    });

    it("dados inválidos respondem 400 com os campos", async () => {
      const { dono } = await barbearia("Inválido");
      const r = await t
        .http()
        .post("/equipe/convites")
        .set(dono.auth)
        .send({ nome: "", email: "x", papel: "gerente" });
      expect(r.status).toBe(400);
      expect(Object.keys(Erro.parse(r.body).campos ?? {}).sort()).toEqual([
        "email",
        "nome",
        "papel",
      ]);
    });
  });

  describe("POST /equipe/{id}/reenviar-convite", () => {
    async function convidado(dono: Conta, email: string) {
      const r = await t
        .http()
        .post("/equipe/convites")
        .set(dono.auth)
        .send({ nome: "Fred", email, papel: "barbeiro" });
      return {
        id: ConvidarSaida.parse(r.body).usuario.id,
        token: tokenDoConvite(t.email.ultimaPara(email)?.texto ?? ""),
      };
    }

    it("invalida o link anterior e envia outro, que funciona", async () => {
      const { dono } = await barbearia("Reenvia");
      const c = await convidado(dono, "fred-reenvia@exemplo.com");
      const r = await t
        .http()
        .post(`/equipe/${c.id}/reenviar-convite`)
        .set(dono.auth);
      expect(r.status).toBe(200);
      expect(ReenviarSaida.parse(r.body).conviteEnviado).toBe(true);

      expect((await t.http().get(`/auth/convites/${c.token}`)).status).toBe(
        410,
      );
      const novo = tokenDoConvite(
        t.email.ultimaPara("fred-reenvia@exemplo.com")?.texto ?? "",
      );
      expect(novo).not.toBe(c.token);
      expect((await t.http().get(`/auth/convites/${novo}`)).status).toBe(200);
    });

    it("usuário que não está convidado responde 409 USUARIO_NAO_CONVIDADO", async () => {
      const { dono, barbeiro } = await barbearia("Reenvia ativo");
      const r = await t
        .http()
        .post(`/equipe/${barbeiro.id}/reenviar-convite`)
        .set(dono.auth);
      expect(r.status).toBe(409);
      expect(Erro.parse(r.body).codigo).toBe("USUARIO_NAO_CONVIDADO");
    });
  });

  describe("POST /equipe/{id}/desativar", () => {
    it("revoga as sessões abertas na hora e recusa novo login (SC-004)", async () => {
      const { tenantId, dono, barbeiro } = await barbearia("Desativa");
      expect((await t.http().get("/auth/eu").set(barbeiro.auth)).status).toBe(
        200,
      );

      const r = await t
        .http()
        .post(`/equipe/${barbeiro.id}/desativar`)
        .set(dono.auth);
      expect(r.status).toBe(204);

      expect((await t.http().get("/auth/eu").set(barbeiro.auth)).status).toBe(
        401,
      );
      const login = await t
        .http()
        .post("/auth/login")
        .send({ email: barbeiro.email, senha: SENHA, cliente: "web" });
      expect(login.status).toBe(401);

      const [linha] = await comTenantAdmin(tenantId, (tx) =>
        tx.select().from(usuario).where(eq(usuario.id, barbeiro.id)),
      );
      expect(linha).toMatchObject({ situacao: "desativado" });
      expect(linha?.desativadoEm).toBeInstanceOf(Date);
      const ev = (await eventosDe(tenantId)).filter(
        (e) => e.tipo === "usuario_desativado",
      );
      expect(ev).toMatchObject([
        { atorUsuarioId: dono.id, alvoUsuarioId: barbeiro.id },
      ]);
    });

    it("é idempotente: desativar de novo responde 204 sem novo evento", async () => {
      const { tenantId, dono, barbeiro } = await barbearia("Idempotente");
      await t.http().post(`/equipe/${barbeiro.id}/desativar`).set(dono.auth);
      expect(
        (await t.http().post(`/equipe/${barbeiro.id}/desativar`).set(dono.auth))
          .status,
      ).toBe(204);
      expect(
        (await eventosDe(tenantId)).filter(
          (e) => e.tipo === "usuario_desativado",
        ),
      ).toHaveLength(1);
    });

    it("o único dono ativo não pode ser desativado, nem por ele mesmo (409 ULTIMO_DONO)", async () => {
      const { dono } = await barbearia("Último dono");
      const r = await t
        .http()
        .post(`/equipe/${dono.id}/desativar`)
        .set(dono.auth);
      expect(r.status).toBe(409);
      expect(Erro.parse(r.body).codigo).toBe("ULTIMO_DONO");
      expect((await t.http().get("/auth/eu").set(dono.auth)).status).toBe(200);
    });

    it("com dois donos, um pode desativar o outro; o que sobra vira o último", async () => {
      const { tenantId, dono } = await barbearia("Dois donos");
      const socio = await conta(tenantId, "dono", "Sócio");
      expect(
        (await t.http().post(`/equipe/${socio.id}/desativar`).set(dono.auth))
          .status,
      ).toBe(204);
      const r = await t
        .http()
        .post(`/equipe/${dono.id}/desativar`)
        .set(dono.auth);
      expect(r.status).toBe(409);
    });

    it("desativar um convidado cancela o convite pendente", async () => {
      const { dono } = await barbearia("Cancela convite");
      const r = await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Gil",
        email: "gil-equipe@exemplo.com",
        papel: "barbeiro",
      });
      const id = ConvidarSaida.parse(r.body).usuario.id;
      const token = tokenDoConvite(
        t.email.ultimaPara("gil-equipe@exemplo.com")?.texto ?? "",
      );
      expect(
        (await t.http().post(`/equipe/${id}/desativar`).set(dono.auth)).status,
      ).toBe(204);
      expect((await t.http().get(`/auth/convites/${token}`)).status).toBe(410);
    });

    it("dois donos desativando um ao outro ao mesmo tempo: a barbearia nunca fica sem dono ativo", async () => {
      const { tenantId, dono } = await barbearia("Corrida");
      const socio = await conta(tenantId, "dono", "Sócio");
      const respostas = await Promise.all([
        t.http().post(`/equipe/${socio.id}/desativar`).set(dono.auth),
        t.http().post(`/equipe/${dono.id}/desativar`).set(socio.auth),
      ]);
      const status = respostas.map((r) => r.status).sort();
      expect(status.filter((s) => s === 204)).toHaveLength(1);
      expect(status.filter((s) => s === 409 || s === 401)).toHaveLength(1);
      const donos = await comTenantAdmin(tenantId, (tx) =>
        tx.select().from(usuario),
      );
      expect(
        donos.filter((u) => u.papel === "dono" && u.situacao === "ativo"),
      ).toHaveLength(1);
    });
  });

  describe("POST /equipe/{id}/reativar", () => {
    it("com senha definida volta a ativo e entra com as mesmas credenciais", async () => {
      const { tenantId, dono, barbeiro } = await barbearia("Reativa");
      await t.http().post(`/equipe/${barbeiro.id}/desativar`).set(dono.auth);
      expect(
        (await t.http().post(`/equipe/${barbeiro.id}/reativar`).set(dono.auth))
          .status,
      ).toBe(204);

      const login = await t
        .http()
        .post("/auth/login")
        .send({ email: barbeiro.email, senha: SENHA, cliente: "mobile" });
      expect(login.status).toBe(200);
      const [linha] = await comTenantAdmin(tenantId, (tx) =>
        tx.select().from(usuario).where(eq(usuario.id, barbeiro.id)),
      );
      expect(linha).toMatchObject({ situacao: "ativo", desativadoEm: null });
      expect(
        (await eventosDe(tenantId)).filter(
          (e) => e.tipo === "usuario_reativado",
        ),
      ).toHaveLength(1);
    });

    it("sem senha definida volta a convidado e recebe um novo convite", async () => {
      const { tenantId, dono } = await barbearia("Reativa convidado");
      const r = await t.http().post("/equipe/convites").set(dono.auth).send({
        nome: "Hugo",
        email: "hugo-equipe@exemplo.com",
        papel: "barbeiro",
      });
      const id = ConvidarSaida.parse(r.body).usuario.id;
      await t.http().post(`/equipe/${id}/desativar`).set(dono.auth);
      t.email.limpar();
      expect(
        (await t.http().post(`/equipe/${id}/reativar`).set(dono.auth)).status,
      ).toBe(204);
      const [linha] = await comTenantAdmin(tenantId, (tx) =>
        tx.select().from(usuario).where(eq(usuario.id, id)),
      );
      expect(linha?.situacao).toBe("convidado");
      expect(t.email.ultimaPara("hugo-equipe@exemplo.com")?.texto).toContain(
        "/convite/",
      );
    });

    it("usuário que não está desativado responde 409 USUARIO_NAO_DESATIVADO", async () => {
      const { dono, barbeiro } = await barbearia("Reativa ativo");
      const r = await t
        .http()
        .post(`/equipe/${barbeiro.id}/reativar`)
        .set(dono.auth);
      expect(r.status).toBe(409);
      expect(Erro.parse(r.body).codigo).toBe("USUARIO_NAO_DESATIVADO");
    });
  });

  describe("isolamento entre barbearias", () => {
    it.each(["reenviar-convite", "desativar", "reativar"])(
      "%s com o id de outra barbearia responde 404 NAO_ENCONTRADO, igual a um id inexistente",
      async (acao) => {
        const a = await barbearia("Isola A");
        const b = await barbearia("Isola B");
        const deB = await t
          .http()
          .post(`/equipe/${b.barbeiro.id}/${acao}`)
          .set(a.dono.auth);
        const inexistente = await t
          .http()
          .post(`/equipe/${ID_INEXISTENTE}/${acao}`)
          .set(a.dono.auth);
        const malformado = await t
          .http()
          .post(`/equipe/nao-e-uuid/${acao}`)
          .set(a.dono.auth);
        expect(deB.status).toBe(404);
        expect(deB.body).toEqual(inexistente.body);
        expect(malformado.status).toBe(404);
        expect(malformado.body).toEqual(inexistente.body);
        expect(Erro.parse(deB.body).codigo).toBe("NAO_ENCONTRADO");

        // E o usuário de B segue exatamente como estava.
        const [intacto] = await comTenantAdmin(b.tenantId, (tx) =>
          tx.select().from(usuario).where(eq(usuario.id, b.barbeiro.id)),
        );
        expect(intacto?.situacao).toBe("ativo");
      },
    );
  });

  it("a conexão administrativa não enxerga a equipe de outro tenant (sanidade do harness)", async () => {
    const { rows } = await conexaoAdmin().query(
      "select count(*)::int as n from usuario",
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
