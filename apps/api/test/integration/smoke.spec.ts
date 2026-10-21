import { afterAll, describe, expect, it } from "vitest";
import { conexaoAdmin, conexaoRuntime, fecharConexoes } from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";

describe("harness de integração", () => {
  afterAll(fecharConexoes);

  it("cria barbearia e usuário com o dono não superusuário", async () => {
    const { barbeariaId } = await criarBarbearia();
    const id = await criarUsuario({ tenantId: barbeariaId, papel: "dono" });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("o dono não é superusuário e a API não contorna a RLS", async () => {
    const dono = await conexaoAdmin().query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(dono.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const api = await conexaoRuntime().query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(api.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});
