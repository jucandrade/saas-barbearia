import { afterAll, describe, expect, it } from "vitest";
import { executarCli } from "../../src/cli/comandos.js";
import { eventoSeguranca, usuario } from "../../src/db/schema/index.js";
import { ErroPlataforma } from "../../src/identidade/provisionamento/erro-plataforma.js";
import { hashToken } from "../../src/identidade/seguranca/tokens.js";
import {
  comTenantAdmin,
  contarUsuariosPorEmail,
  fecharConexoes,
} from "./helpers/db.js";
import { criarBarbearia, criarUsuario } from "./helpers/fabrica.js";
import {
  criarFerramentasDePlataforma,
  tokenDoConvite,
} from "./helpers/plataforma.js";

let n = 0;
async function novoDono(f: ReturnType<typeof criarFerramentasDePlataforma>) {
  n += 1;
  const email = `dono-reenv-${String(n)}@exemplo.com`;
  const r = await f.provisionamento.provisionar({
    nome: `Reenvio ${String(n)}`,
    unidade: "Matriz",
    fuso: "America/Sao_Paulo",
    donoNome: "Dona Ana",
    donoEmail: email,
  });
  const tokenAntigo = tokenDoConvite(f.email.ultimaPara(email)?.texto ?? "");
  f.email.limpar();
  return { ...r, email, tokenAntigo };
}

describe("reenviar-convite-dono", () => {
  afterAll(fecharConexoes);

  it("invalida o convite anterior, cria outro de 7 dias e reenvia", async () => {
    const f = criarFerramentasDePlataforma();
    const d = await novoDono(f);
    f.relogio.avancar(2 * 24 * 60 * 60 * 1000);

    const r = await f.reenvio.reenviar({ email: d.email });
    expect(r.conviteEnviado).toBe(true);

    const antigo = await f.tenantDb
      .semTenant()
      .buscarTokenAcesso(hashToken(d.tokenAntigo), "convite");
    expect(antigo?.invalidadoEm).toEqual(f.relogio.agora());

    const novo = tokenDoConvite(f.email.ultimaPara(d.email)?.texto ?? "");
    expect(novo).not.toBe(d.tokenAntigo);
    const guardado = await f.tenantDb
      .semTenant()
      .buscarTokenAcesso(hashToken(novo), "convite");
    expect(guardado?.invalidadoEm).toBeNull();
    expect(guardado?.expiraEm).toEqual(
      new Date(f.relogio.agora().getTime() + 7 * 24 * 60 * 60 * 1000),
    );
  });

  it("recusa dono já ativo, barbeiro e e-mail inexistente", async () => {
    const f = criarFerramentasDePlataforma();
    const { barbeariaId } = await criarBarbearia("Reenvio recusas");
    await criarUsuario({
      tenantId: barbeariaId,
      email: "ativo-reenv@exemplo.com",
      papel: "dono",
      situacao: "ativo",
    });
    await criarUsuario({
      tenantId: barbeariaId,
      email: "barbeiro-reenv@exemplo.com",
      papel: "barbeiro",
      situacao: "convidado",
    });

    await expect(
      f.reenvio.reenviar({ email: "ativo-reenv@exemplo.com" }),
    ).rejects.toBeInstanceOf(ErroPlataforma);
    await expect(
      f.reenvio.reenviar({ email: "barbeiro-reenv@exemplo.com" }),
    ).rejects.toBeInstanceOf(ErroPlataforma);
    await expect(
      f.reenvio.reenviar({ email: "ninguem-reenv@exemplo.com" }),
    ).rejects.toBeInstanceOf(ErroPlataforma);
    expect(f.email.mensagens).toHaveLength(0);
  });

  it("--novo-email corrige o e-mail enquanto convidado e envia para o novo endereço", async () => {
    const f = criarFerramentasDePlataforma();
    const d = await novoDono(f);
    const corrigido = `corrigido-${String(n)}@exemplo.com`;
    await f.reenvio.reenviar({
      email: d.email,
      novoEmail: `  ${corrigido.toUpperCase()} `,
    });

    expect(f.email.ultimaPara(corrigido)).toBeDefined();
    expect(f.email.ultimaPara(d.email)).toBeUndefined();
    expect(await contarUsuariosPorEmail(d.email)).toBe(0);
    const u = await comTenantAdmin(d.barbeariaId, (tx) =>
      tx.select().from(usuario),
    );
    expect(u[0]?.email).toBe(corrigido);
  });

  it("--novo-email recusa um e-mail que já existe", async () => {
    const f = criarFerramentasDePlataforma();
    const a = await novoDono(f);
    const b = await novoDono(f);
    await expect(
      f.reenvio.reenviar({ email: a.email, novoEmail: b.email }),
    ).rejects.toThrow(new ErroPlataforma("E-mail indisponível."));
    expect(await contarUsuariosPorEmail(a.email)).toBe(1);
  });

  it("grava convite_enviado com ator plataforma", async () => {
    const f = criarFerramentasDePlataforma();
    const d = await novoDono(f);
    await f.reenvio.reenviar({ email: d.email });
    const eventos = await comTenantAdmin(d.barbeariaId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    const enviados = eventos.filter((e) => e.tipo === "convite_enviado");
    expect(enviados).toHaveLength(2);
    expect(enviados.every((e) => e.atorTipo === "plataforma")).toBe(true);
    expect(JSON.stringify(eventos)).not.toContain(d.email);
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

    it("sai com código 0 quando reenvia", async () => {
      const f = criarFerramentasDePlataforma();
      const d = await novoDono(f);
      const c = io();
      expect(
        await executarCli(
          ["reenviar-convite-dono", "--email", d.email],
          f,
          c.io,
        ),
      ).toBe(0);
      expect(f.email.ultimaPara(d.email)).toBeDefined();
      expect([...c.saida, ...c.erro].join("\n")).not.toContain(d.email);
    });

    it("sai com código ≠ 0 para e-mail inexistente", async () => {
      const f = criarFerramentasDePlataforma();
      const c = io();
      expect(
        await executarCli(
          ["reenviar-convite-dono", "--email", "nunca@exemplo.com"],
          f,
          c.io,
        ),
      ).not.toBe(0);
      expect(c.erro.length).toBeGreaterThan(0);
    });
  });
});
