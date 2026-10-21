import { Controller, Get, Post } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Papeis,
  Publica,
  UsuarioAtual,
} from "../../src/identidade/auth/decorators.js";
import type { UsuarioAutenticado } from "../../src/identidade/http/tipos-http.js";
import { criarApp, ORIGEM_ADMIN, type AppDeTeste } from "./helpers/app.js";
import { fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

@Controller("teste-guard")
class RotasDeTeste {
  @Publica()
  @Get("publica")
  publica(): { ok: true } {
    return { ok: true };
  }

  @Get("protegida")
  protegida(
    @UsuarioAtual() usuario: UsuarioAutenticado | undefined,
  ): UsuarioAutenticado | undefined {
    return usuario;
  }

  @Papeis("dono")
  @Post("so-dono")
  soDono(): { ok: true } {
    return { ok: true };
  }
}

describe("AuthGuard, OrigemGuard e filtro de erros", () => {
  let t: AppDeTeste;
  let tenantId: string;
  let dono: string;
  let barbeiro: string;

  beforeAll(async () => {
    t = await criarApp({ controladores: [RotasDeTeste] });
    ({ barbeariaId: tenantId } = await criarBarbearia());
    dono = await criarUsuario({ tenantId, papel: "dono" });
    barbeiro = await criarUsuario({ tenantId, papel: "barbeiro" });
  });

  afterAll(async () => {
    await t.fechar();
    await fecharConexoes();
  });

  it("rota pública dispensa sessão, inclusive o /health", async () => {
    expect((await t.http().get("/teste-guard/publica")).status).toBe(200);
    expect((await t.http().get("/health")).status).toBe(200);
  });

  it("rota protegida sem sessão responde 401 SESSAO_INVALIDA", async () => {
    const r = await t.http().get("/teste-guard/protegida");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({
      codigo: "SESSAO_INVALIDA",
      mensagem: "Sessão inválida ou expirada. Entre novamente.",
    });
  });

  it("aceita Bearer e injeta usuário, papel e barbearia", async () => {
    const token = await t.abrirSessao({ id: dono, tenantId, papel: "dono" });
    const r = await t
      .http()
      .get("/teste-guard/protegida")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ usuarioId: dono, tenantId, papel: "dono" });
  });

  it("aceita o cookie de sessão", async () => {
    const token = await t.abrirSessao({ id: dono, tenantId, papel: "dono" });
    const r = await t
      .http()
      .get("/teste-guard/protegida")
      .set("Cookie", `sessao=${token}`);
    expect(r.status).toBe(200);
  });

  it("token inválido ou de outro formato responde 401", async () => {
    expect(
      (
        await t
          .http()
          .get("/teste-guard/protegida")
          .set("Authorization", "Bearer lixo")
      ).status,
    ).toBe(401);
    expect(
      (
        await t
          .http()
          .get("/teste-guard/protegida")
          .set("Authorization", "Basic abc")
      ).status,
    ).toBe(401);
  });

  it("@Papeis('dono'): barbeiro recebe 403 SEM_PERMISSAO e dono passa", async () => {
    const tokenBarbeiro = await t.abrirSessao({
      id: barbeiro,
      tenantId,
      papel: "barbeiro",
    });
    const negado = await t
      .http()
      .post("/teste-guard/so-dono")
      .set("Authorization", `Bearer ${tokenBarbeiro}`);
    expect(negado.status).toBe(403);
    expect(negado.body).toMatchObject({ codigo: "SEM_PERMISSAO" });

    const tokenDono = await t.abrirSessao({
      id: dono,
      tenantId,
      papel: "dono",
    });
    expect(
      (
        await t
          .http()
          .post("/teste-guard/so-dono")
          .set("Authorization", `Bearer ${tokenDono}`)
      ).status,
    ).toBe(201);
  });

  it("com cookie, requisição que altera estado exige a origem do admin", async () => {
    const token = await t.abrirSessao({ id: dono, tenantId, papel: "dono" });
    const semOrigem = await t
      .http()
      .post("/teste-guard/so-dono")
      .set("Cookie", `sessao=${token}`);
    expect(semOrigem.status).toBe(403);
    expect(semOrigem.body).toMatchObject({ codigo: "ORIGEM_INVALIDA" });

    const errada = await t
      .http()
      .post("/teste-guard/so-dono")
      .set("Cookie", `sessao=${token}`)
      .set("Origin", "http://evil.example");
    expect(errada.status).toBe(403);

    const certa = await t
      .http()
      .post("/teste-guard/so-dono")
      .set("Cookie", `sessao=${token}`)
      .set("Origin", ORIGEM_ADMIN);
    expect(certa.status).toBe(201);
  });

  it("Bearer não depende de origem (app mobile)", async () => {
    const token = await t.abrirSessao({ id: dono, tenantId, papel: "dono" });
    const r = await t
      .http()
      .post("/teste-guard/so-dono")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(201);
  });

  it("rota inexistente responde 404 no formato de erro da API, com ou sem sessão", async () => {
    const esperado = {
      codigo: "NAO_ENCONTRADO",
      mensagem: "Recurso não encontrado.",
    };
    const anonimo = await t.http().get("/nao-existe");
    expect(anonimo.status).toBe(404);
    expect(anonimo.body).toEqual(esperado);
    const token = await t.abrirSessao({ id: dono, tenantId, papel: "dono" });
    const autenticado = await t
      .http()
      .get("/nao-existe")
      .set("Authorization", `Bearer ${token}`);
    expect(autenticado.status).toBe(404);
    expect(autenticado.body).toEqual(esperado);
  });
});
