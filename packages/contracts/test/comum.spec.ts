import { describe, expect, it } from "vitest";
import { Email, Erro, Papel, Usuario } from "../src/index.js";

const usuarioValido = {
  id: "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10",
  nome: "Ana Souza",
  email: "ana@exemplo.com",
  papel: "dono",
  situacao: "ativo",
  barbeariaId: "7c1a2e44-5b0d-4f6a-8f0c-9d2e1a3b4c55",
};

describe("Usuario", () => {
  it("aceita um usuário válido", () => {
    expect(Usuario.parse(usuarioValido)).toEqual(usuarioValido);
  });

  it("recusa e-mail malformado", () => {
    expect(Usuario.safeParse({ ...usuarioValido, email: "ana@" }).success).toBe(
      false,
    );
  });

  it("recusa papel desconhecido", () => {
    expect(
      Usuario.safeParse({ ...usuarioValido, papel: "gerente" }).success,
    ).toBe(false);
  });

  it("recusa a situação anonimizado, que a API nunca expõe", () => {
    expect(
      Usuario.safeParse({ ...usuarioValido, situacao: "anonimizado" }).success,
    ).toBe(false);
  });

  it("não deixa passar campos sensíveis", () => {
    const resultado = Usuario.parse({ ...usuarioValido, senha_hash: "x" });
    expect(resultado).not.toHaveProperty("senha_hash");
  });
});

describe("Email", () => {
  it("apara e converte para minúsculas", () => {
    expect(Email.parse("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });
});

describe("Papel", () => {
  it("aceita dono e barbeiro", () => {
    expect(Papel.options).toEqual(["dono", "barbeiro"]);
  });
});

describe("Erro", () => {
  it("aceita erro com e sem campos", () => {
    expect(Erro.safeParse({ codigo: "X", mensagem: "Texto" }).success).toBe(
      true,
    );
    expect(
      Erro.safeParse({
        codigo: "DADOS_INVALIDOS",
        mensagem: "Texto",
        campos: { email: "E-mail inválido" },
      }).success,
    ).toBe(true);
  });
});
