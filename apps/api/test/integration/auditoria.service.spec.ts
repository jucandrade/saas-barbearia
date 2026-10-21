import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventoSeguranca } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { AuditoriaService } from "../../src/identidade/auditoria/auditoria.service.js";
import { conexaoRuntime, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

describe("AuditoriaService", () => {
  let tenantDb: TenantDb;
  let auditoria: AuditoriaService;
  let tenantId: string;
  let usuarioId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(conexaoRuntime());
    auditoria = new AuditoriaService(conexaoRuntime());
    ({ barbeariaId: tenantId } = await criarBarbearia());
    usuarioId = await criarUsuario({ tenantId, papel: "dono" });
  });

  afterAll(fecharConexoes);

  it("registra o evento dentro da transação, com autor e horário", async () => {
    await tenantDb.transacao(tenantId, (tx) =>
      auditoria.registrar(tx, tenantId, {
        tipo: "login_sucesso",
        atorTipo: "usuario",
        atorUsuarioId: usuarioId,
        alvoUsuarioId: usuarioId,
        detalhe: { papel: "dono" },
      }),
    );
    const eventos = await tenantDb.transacao(tenantId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      tenantId,
      tipo: "login_sucesso",
      atorTipo: "usuario",
      atorUsuarioId: usuarioId,
      detalhe: { papel: "dono" },
    });
    expect(eventos[0]?.ocorridoEm).toBeInstanceOf(Date);
  });

  it.each(["email", "nome", "senha", "token", "ip", "link", "SenhaHash"])(
    "recusa a chave %s no detalhe, inclusive aninhada",
    async (chave) => {
      await expect(
        tenantDb.transacao(tenantId, (tx) =>
          auditoria.registrar(tx, tenantId, {
            tipo: "login_falha",
            atorTipo: "sistema",
            detalhe: { externo: { [chave]: "valor" } },
          }),
        ),
      ).rejects.toThrow(/não pode conter/);
    },
  );

  it("evento sem tenant (e-mail inexistente) é gravado e não aparece a nenhuma barbearia", async () => {
    await auditoria.registrarSemTenant({
      tipo: "login_falha",
      atorTipo: "sistema",
    });
    const visiveis = await tenantDb.transacao(tenantId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    expect(visiveis.every((e) => e.tenantId === tenantId)).toBe(true);
    const { rows } = await conexaoRuntime().query(
      "select count(*)::int as n from evento_seguranca",
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
