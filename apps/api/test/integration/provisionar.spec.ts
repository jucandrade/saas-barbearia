import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { executarCli } from "../../src/cli/comandos.js";
import {
  barbearia,
  eventoSeguranca,
  unidade,
  usuario,
} from "../../src/db/schema/index.js";
import { AuditoriaService } from "../../src/identidade/auditoria/auditoria.service.js";
import { ErroPlataforma } from "../../src/identidade/provisionamento/erro-plataforma.js";
import { hashToken } from "../../src/identidade/seguranca/tokens.js";
import { ORIGEM_ADMIN } from "./helpers/app.js";
import {
  comTenantAdmin,
  conexaoAdmin,
  contarBarbearias,
  contarUsuariosPorEmail,
  fecharConexoes,
} from "./helpers/db.js";
import {
  criarFerramentasDePlataforma,
  tokenDoConvite,
} from "./helpers/plataforma.js";

const DIA = 24 * 60 * 60 * 1000;

function dados(sufixo: string) {
  return {
    nome: `Prov ${sufixo}`,
    unidade: "Matriz",
    fuso: "America/Sao_Paulo",
    donoNome: "Dona Ana",
    donoEmail: `ana-${sufixo}@exemplo.com`,
  };
}

describe("provisionar-barbearia", () => {
  afterAll(fecharConexoes);

  it("cria barbearia, unidade e dono convidado numa só transação", async () => {
    const f = criarFerramentasDePlataforma();
    const r = await f.provisionamento.provisionar({
      ...dados("a"),
      donoEmail: "  Ana-A@Exemplo.com ",
    });

    const criado = await comTenantAdmin(r.barbeariaId, async (tx) => ({
      barbearias: await tx.select().from(barbearia),
      unidades: await tx.select().from(unidade),
      usuarios: await tx.select().from(usuario),
    }));
    expect(criado.barbearias).toMatchObject([
      { id: r.barbeariaId, nome: "Prov a" },
    ]);
    expect(criado.unidades).toMatchObject([
      {
        tenantId: r.barbeariaId,
        nome: "Matriz",
        fusoHorario: "America/Sao_Paulo",
      },
    ]);
    expect(criado.usuarios).toMatchObject([
      {
        tenantId: r.barbeariaId,
        nome: "Dona Ana",
        email: "ana-a@exemplo.com",
        papel: "dono",
        situacao: "convidado",
        senhaHash: null,
      },
    ]);
    expect(r.conviteEnviado).toBe(true);
  });

  it("envia o convite, com validade de 7 dias, e guarda só o hash do token", async () => {
    const f = criarFerramentasDePlataforma();
    await f.provisionamento.provisionar(dados("b"));
    const mensagem = f.email.ultimaPara("ana-b@exemplo.com");
    expect(mensagem?.texto).toContain(`${ORIGEM_ADMIN}/convite/`);

    const token = tokenDoConvite(mensagem?.texto ?? "");
    const guardado = await f.tenantDb
      .semTenant()
      .buscarTokenAcesso(hashToken(token), "convite");
    expect(guardado?.expiraEm).toEqual(
      new Date(f.relogio.agora().getTime() + 7 * DIA),
    );
    expect(guardado?.usadoEm).toBeNull();
  });

  it("grava barbearia_provisionada e convite_enviado com ator plataforma, sem dado pessoal", async () => {
    const f = criarFerramentasDePlataforma();
    const r = await f.provisionamento.provisionar(dados("c"));
    const eventos = await comTenantAdmin(r.barbeariaId, (tx) =>
      tx.select().from(eventoSeguranca),
    );
    expect(eventos.map((e) => e.tipo).sort()).toEqual([
      "barbearia_provisionada",
      "convite_enviado",
    ]);
    expect(
      eventos.every(
        (e) => e.atorTipo === "plataforma" && e.atorUsuarioId === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(eventos)).not.toContain("ana-c@exemplo.com");
    expect(JSON.stringify(eventos)).not.toContain("Dona Ana");
  });

  it("e-mail já usado falha com 'E-mail indisponível' e não cria nada", async () => {
    const f = criarFerramentasDePlataforma();
    await f.provisionamento.provisionar(dados("d"));
    await expect(
      f.provisionamento.provisionar({
        ...dados("d2"),
        donoEmail: "ana-d@exemplo.com",
      }),
    ).rejects.toThrow(new ErroPlataforma("E-mail indisponível."));
    expect(await contarBarbearias("Prov d2")).toBe(0);
    expect(await contarUsuariosPorEmail("ana-d@exemplo.com")).toBe(1);
  });

  it("fuso inexistente falha e não cria nada", async () => {
    const f = criarFerramentasDePlataforma();
    await expect(
      f.provisionamento.provisionar({ ...dados("e"), fuso: "Marte/Olimpo" }),
    ).rejects.toThrow(/fuso/i);
    expect(await contarBarbearias("Prov e")).toBe(0);
    expect(await contarUsuariosPorEmail("ana-e@exemplo.com")).toBe(0);
  });

  it("uma falha no meio da transação não deixa nada pela metade", async () => {
    const auditoriaQueFalha = Object.assign(
      new AuditoriaService(conexaoAdmin()),
      {
        registrar: () => Promise.reject(new Error("falha simulada")),
      },
    );
    const f = criarFerramentasDePlataforma({ auditoria: auditoriaQueFalha });
    await expect(f.provisionamento.provisionar(dados("f"))).rejects.toThrow();
    expect(await contarBarbearias("Prov f")).toBe(0);
    expect(await contarUsuariosPorEmail("ana-f@exemplo.com")).toBe(0);
    expect(f.email.mensagens).toHaveLength(0);
  });

  it("dois provisionamentos simultâneos com o mesmo e-mail: um só tem sucesso", async () => {
    const f = criarFerramentasDePlataforma();
    const resultados = await Promise.allSettled([
      f.provisionamento.provisionar({
        ...dados("g1"),
        donoEmail: "ana-g@exemplo.com",
      }),
      f.provisionamento.provisionar({
        ...dados("g2"),
        donoEmail: "ana-g@exemplo.com",
      }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = resultados.find((r) => r.status === "rejected");
    expect(falha?.status === "rejected" && falha.reason).toEqual(
      new ErroPlataforma("E-mail indisponível."),
    );
    expect(
      (await contarBarbearias("Prov g1")) + (await contarBarbearias("Prov g2")),
    ).toBe(1);
    expect(await contarUsuariosPorEmail("ana-g@exemplo.com")).toBe(1);
  });

  it("não cria usuário nem barbearia de outro tenant por engano (cada provisionamento é isolado)", async () => {
    const f = criarFerramentasDePlataforma();
    const a = await f.provisionamento.provisionar(dados("h1"));
    const b = await f.provisionamento.provisionar(dados("h2"));
    expect(a.barbeariaId).not.toBe(b.barbeariaId);
    const deA = await comTenantAdmin(a.barbeariaId, (tx) =>
      tx.select().from(usuario).where(eq(usuario.tenantId, b.barbeariaId)),
    );
    expect(deA).toHaveLength(0);
  });

  describe("comando da linha de comando", () => {
    const argv = (sufixo: string) => {
      const d = dados(sufixo);
      return [
        "provisionar-barbearia",
        "--nome",
        d.nome,
        "--unidade",
        d.unidade,
        "--fuso",
        d.fuso,
        "--dono-nome",
        d.donoNome,
        "--dono-email",
        d.donoEmail,
      ];
    };
    function io() {
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
    }

    it("sai com código 0 e imprime só o id da barbearia, sem token nem link", async () => {
      const f = criarFerramentasDePlataforma();
      const c = io();
      const codigo = await executarCli(argv("i"), f, c.io);
      expect(codigo).toBe(0);
      const texto = [...c.saida, ...c.erro].join("\n");
      expect(texto).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      const mensagem = f.email.ultimaPara("ana-i@exemplo.com");
      expect(mensagem).toBeDefined();
      expect(texto).not.toContain(tokenDoConvite(mensagem?.texto ?? ""));
      expect(texto).not.toContain("/convite/");
      expect(texto).not.toContain("ana-i@exemplo.com");
    });

    it("e-mail repetido sai com código ≠ 0 e mensagem clara", async () => {
      const f = criarFerramentasDePlataforma();
      await executarCli(argv("j"), f, io().io);
      const c = io();
      const codigo = await executarCli(
        [...argv("j2").slice(0, -1), "ana-j@exemplo.com"],
        f,
        c.io,
      );
      expect(codigo).not.toBe(0);
      expect(c.erro.join("\n")).toContain("E-mail indisponível");
    });

    it("argumentos inválidos saem com código ≠ 0 e apontam o campo", async () => {
      const f = criarFerramentasDePlataforma();
      const c = io();
      const codigo = await executarCli(
        [...argv("k").slice(0, -1), "ana@"],
        f,
        c.io,
      );
      expect(codigo).not.toBe(0);
      expect(c.erro.join("\n")).toMatch(/donoEmail/);
      expect(await contarBarbearias("Prov k")).toBe(0);
    });

    it("comando desconhecido sai com código ≠ 0", async () => {
      const f = criarFerramentasDePlataforma();
      const c = io();
      expect(await executarCli(["nao-existe"], f, c.io)).not.toBe(0);
      expect(c.erro.join("\n")).toMatch(/Comandos/);
    });

    it("se o envio do e-mail falhar, a barbearia fica criada e o código é 3, orientando o reenvio", async () => {
      const f = criarFerramentasDePlataforma();
      f.email.falharProximo = true;
      const c = io();
      const codigo = await executarCli(argv("l"), f, c.io);
      expect(codigo).toBe(3);
      expect(c.erro.join("\n")).toContain("reenviar-convite-dono");
      expect(await contarBarbearias("Prov l")).toBe(1);
    });
  });
});
