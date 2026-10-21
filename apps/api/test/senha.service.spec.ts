import { describe, expect, it } from "vitest";
import { lerEnv } from "../src/config/env.js";
import { SenhaService } from "../src/identidade/seguranca/senha.service.js";

// Parâmetros baixos só para o teste ficar rápido; os padrões são os da OWASP.
const servico = new SenhaService(
  lerEnv({
    ARGON2_MEMORY_KIB: "1024",
    ARGON2_TIME_COST: "1",
    ARGON2_PARALLELISM: "1",
  }),
);

describe("SenhaService", () => {
  it("gera hash argon2id com os parâmetros configurados, nunca a senha", async () => {
    const hash = await servico.hash("uma senha qualquer");
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(hash).toContain("m=1024");
    expect(hash).toContain("t=1");
    expect(hash).toContain("p=1");
    expect(hash).not.toContain("uma senha qualquer");
  });

  it("gera hashes diferentes para a mesma senha (sal aleatório)", async () => {
    expect(await servico.hash("repetida")).not.toBe(
      await servico.hash("repetida"),
    );
  });

  it("verifica a senha certa e recusa a errada", async () => {
    const hash = await servico.hash("cadeira7");
    expect(await servico.verificar(hash, "cadeira7")).toBe(true);
    expect(await servico.verificar(hash, "cadeira8")).toBe(false);
  });

  it("um hash inválido é recusado, sem lançar erro", async () => {
    expect(await servico.verificar("isto-nao-e-um-hash", "x")).toBe(false);
  });

  it("a verificação fictícia devolve falso", async () => {
    expect(await servico.verificarSenhaFicticia("qualquer")).toBe(false);
  });
});
