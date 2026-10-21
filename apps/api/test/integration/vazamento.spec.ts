import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EuSaida, SessaoSaida } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { usuario } from "../../src/db/schema/index.js";
import { SenhaService } from "../../src/identidade/seguranca/senha.service.js";
import { criarApp, type AppDeTeste } from "./helpers/app.js";
import { comTenantAdmin, fecharConexoes } from "./helpers/db.js";
import {
  criarBarbearia,
  criarTokenAcesso,
  criarUsuario,
} from "./helpers/fabrica.js";

/**
 * Suíte de vazamento entre barbearias (FR-018, FR-019, SC-003).
 *
 * Cada linha de ROTAS é uma tentativa da barbearia A de alcançar algo da B por um
 * caminho HTTP. Ao acrescentar um endpoint (equipe, recuperação…), acrescente a
 * linha dele aqui: o objetivo é cobrir TODOS os caminhos de acesso existentes.
 */

interface Ator {
  tenantId: string;
  usuarioId: string;
  nomeBarbearia: string;
  nomeUsuario: string;
  email: string;
  token: string;
  /** Um barbeiro ainda convidado, com o token do convite dele. */
  convidadoId: string;
  convidadoEmail: string;
  tokenDoConvite: string;
}

interface Contexto {
  t: AppDeTeste;
  a: Ator;
  b: Ator;
  senha: string;
}

interface RotaCruzada {
  nome: string;
  executar: (ctx: Contexto) => Promise<void>;
}

/** Nenhum identificador, nome nem e-mail do ator aparece no texto. */
function semRastroDe(texto: string, ator: Ator): void {
  for (const rastro of [
    ator.tenantId,
    ator.usuarioId,
    ator.nomeBarbearia,
    ator.nomeUsuario,
    ator.email,
    ator.convidadoId,
    ator.convidadoEmail,
    ator.tokenDoConvite,
  ]) {
    expect(texto).not.toContain(rastro);
  }
}

export const ROTAS: RotaCruzada[] = [
  {
    nome: "GET /auth/eu como A não traz nada de B",
    async executar({ t, a, b }) {
      const r = await t
        .http()
        .get("/auth/eu")
        .set("Authorization", `Bearer ${a.token}`);
      expect(r.status).toBe(200);
      const eu = EuSaida.parse(r.body);
      expect(eu.usuario.barbeariaId).toBe(a.tenantId);
      expect(eu.barbearia.id).toBe(a.tenantId);
      semRastroDe(JSON.stringify(r.body), b);
    },
  },
  {
    nome: "GET /auth/convites/{token de B} é igual para A logada e para anônimo, e só traz o próprio convite",
    async executar({ t, a, b }) {
      const anonimo = await t.http().get(`/auth/convites/${b.tokenDoConvite}`);
      const comoA = await t
        .http()
        .get(`/auth/convites/${b.tokenDoConvite}`)
        .set("Authorization", `Bearer ${a.token}`);
      expect(comoA.status).toBe(anonimo.status);
      expect(comoA.body).toEqual(anonimo.body);
      expect(JSON.stringify(comoA.body)).toContain(b.nomeBarbearia);
      semRastroDe(JSON.stringify(comoA.body), a);
    },
  },
  {
    nome: "POST /auth/convites/aceitar com o token de B, estando logada como A, só ativa o convidado de B",
    async executar({ t, a, b, senha }) {
      const r = await t
        .http()
        .post("/auth/convites/aceitar")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ token: b.tokenDoConvite, senha, cliente: "mobile" });
      expect(r.status).toBe(200);
      const sessao = SessaoSaida.parse(r.body);
      expect(sessao.usuario.barbeariaId).toBe(b.tenantId);
      semRastroDe(JSON.stringify(r.body), a);

      const doA = await comTenantAdmin(a.tenantId, (tx) =>
        tx.select().from(usuario).where(eq(usuario.id, a.convidadoId)),
      );
      expect(doA[0]?.situacao).toBe("convidado");
    },
  },
  {
    nome: "POST /auth/login com o e-mail de B e a senha de A responde o 401 genérico, sem nada de B",
    async executar({ t, a, b }) {
      const r = await t
        .http()
        .post("/auth/login")
        .send({
          email: b.email,
          senha: `${a.nomeUsuario}-errada`,
          cliente: "web",
        });
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ codigo: "CREDENCIAIS_INVALIDAS" });
      semRastroDe(JSON.stringify(r.body), b);
    },
  },
  {
    nome: "POST /auth/logout de A não encerra a sessão de B",
    async executar({ t, a, b }) {
      expect(
        (
          await t
            .http()
            .post("/auth/logout")
            .set("Authorization", `Bearer ${a.token}`)
        ).status,
      ).toBe(204);
      expect(
        (
          await t
            .http()
            .get("/auth/eu")
            .set("Authorization", `Bearer ${a.token}`)
        ).status,
      ).toBe(401);
      const deB = await t
        .http()
        .get("/auth/eu")
        .set("Authorization", `Bearer ${b.token}`);
      expect(deB.status).toBe(200);
      expect(EuSaida.parse(deB.body).barbearia.id).toBe(b.tenantId);
    },
  },
];

describe("vazamento entre barbearias (HTTP)", () => {
  const senha = "cadeira-de-barbeiro";
  let t: AppDeTeste;
  let hash: string;
  let contador = 0;

  async function ator(nome: string): Promise<Ator> {
    contador += 1;
    const sufixo = String(contador);
    const nomeBarbearia = `Barbearia ${nome} ${sufixo}`;
    const { barbeariaId: tenantId } = await criarBarbearia(nomeBarbearia);
    const nomeUsuario = `Dono ${nome} ${sufixo}`;
    const email = `dono-${nome.toLowerCase()}-${sufixo}@exemplo.com`;
    const usuarioId = await criarUsuario({
      tenantId,
      nome: nomeUsuario,
      email,
      papel: "dono",
      senhaHash: hash,
    });
    const convidadoEmail = `convidado-${nome.toLowerCase()}-${sufixo}@exemplo.com`;
    const convidadoId = await criarUsuario({
      tenantId,
      nome: `Convidado ${nome} ${sufixo}`,
      email: convidadoEmail,
      papel: "barbeiro",
      situacao: "convidado",
    });
    const tokenDoConvite = await criarTokenAcesso({
      tenantId,
      usuarioId: convidadoId,
      expiraEm: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const token = await t.abrirSessao({
      id: usuarioId,
      tenantId,
      papel: "dono",
    });
    return {
      tenantId,
      usuarioId,
      nomeBarbearia,
      nomeUsuario,
      email,
      token,
      convidadoId,
      convidadoEmail,
      tokenDoConvite,
    };
  }

  beforeAll(async () => {
    t = await criarApp();
    hash = await t.app.get(SenhaService).hash(senha);
  });

  afterAll(async () => {
    await t.fechar();
    await fecharConexoes();
  });

  it("a tabela cobre os endpoints existentes", () => {
    expect(ROTAS.length).toBeGreaterThanOrEqual(5);
  });

  // Barbearias e sessões novas para cada rota: as rotas alteram estado (logout, aceite de convite).
  it.each(ROTAS)("$nome", async ({ executar }) => {
    await executar({ t, senha, a: await ator("A"), b: await ator("B") });
  });
});
