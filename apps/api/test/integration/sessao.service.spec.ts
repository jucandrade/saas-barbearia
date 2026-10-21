import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessao, usuario } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { SessaoService } from "../../src/identidade/auth/sessao.service.js";
import { RelogioControlavel } from "../../src/identidade/relogio.js";
import { hashToken } from "../../src/identidade/seguranca/tokens.js";
import { conexaoRuntime, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

describe("SessaoService", () => {
  let tenantDb: TenantDb;
  let relogio: RelogioControlavel;
  let servico: SessaoService;
  let tenantId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(conexaoRuntime());
    ({ barbeariaId: tenantId } = await criarBarbearia());
  });

  afterAll(fecharConexoes);

  async function abrir(papel: "dono" | "barbeiro") {
    relogio = new RelogioControlavel();
    servico = new SessaoService(tenantDb, relogio);
    const id = await criarUsuario({ tenantId, papel, situacao: "ativo" });
    const token = await tenantDb.transacao(tenantId, (tx) =>
      servico.iniciar(tx, { id, tenantId, papel }),
    );
    return { id, token };
  }

  it("inicia a sessão guardando só o hash e resolve o token", async () => {
    const { id, token } = await abrir("dono");
    const linhas = await tenantDb.transacao(tenantId, (tx) =>
      tx.select().from(sessao),
    );
    const dele = linhas.find((l) => l.usuarioId === id);
    expect(dele?.tokenHash.equals(hashToken(token))).toBe(true);
    expect(dele?.tokenHash.toString("base64url")).not.toBe(token);

    expect(await servico.resolver(token)).toMatchObject({
      usuarioId: id,
      tenantId,
      papel: "dono",
    });
  });

  it("token desconhecido não resolve", async () => {
    await abrir("dono");
    expect(await servico.resolver("token-que-nao-existe")).toBeUndefined();
  });

  it("a sessão do dono expira após 12 horas de inatividade", async () => {
    const { token } = await abrir("dono");
    relogio.avancar(12 * HORA - 1000);
    expect(await servico.resolver(token)).toBeDefined();
    relogio.avancar(12 * HORA + 1000);
    expect(await servico.resolver(token)).toBeUndefined();
  });

  it("a do barbeiro dura 30 dias de inatividade", async () => {
    const { token } = await abrir("barbeiro");
    relogio.avancar(29 * DIA);
    expect(await servico.resolver(token)).toBeDefined();
    relogio.avancar(31 * DIA);
    expect(await servico.resolver(token)).toBeUndefined();
  });

  it("o uso renova a expiração (inatividade deslizante)", async () => {
    const { token } = await abrir("dono");
    relogio.avancar(11 * HORA);
    expect(await servico.resolver(token)).toBeDefined();
    relogio.avancar(11 * HORA);
    expect(await servico.resolver(token)).toBeDefined();
  });

  it("revogar vale na requisição seguinte", async () => {
    const { token } = await abrir("dono");
    const sessaoResolvida = await servico.resolver(token);
    await tenantDb.transacao(tenantId, (tx) =>
      servico.revogar(tx, sessaoResolvida?.sessaoId ?? ""),
    );
    expect(await servico.resolver(token)).toBeUndefined();
  });

  it("revogarTodas encerra todas as sessões do usuário", async () => {
    const { id, token } = await abrir("barbeiro");
    const segundo = await tenantDb.transacao(tenantId, (tx) =>
      servico.iniciar(tx, { id, tenantId, papel: "barbeiro" }),
    );
    await tenantDb.transacao(tenantId, (tx) => servico.revogarTodas(tx, id));
    expect(await servico.resolver(token)).toBeUndefined();
    expect(await servico.resolver(segundo)).toBeUndefined();
  });

  it("usuário que deixou de estar ativo não resolve, mesmo com a sessão vigente", async () => {
    const { id, token } = await abrir("barbeiro");
    await tenantDb.transacao(tenantId, (tx) =>
      tx
        .update(usuario)
        .set({ situacao: "desativado" })
        .where(eq(usuario.id, id)),
    );
    expect(await servico.resolver(token)).toBeUndefined();
  });
});
