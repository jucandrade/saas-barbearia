import { describe, expect, it } from "vitest";
import { validarSenha } from "../../src/identidade/senha.js";

const contexto = { email: "ana@exemplo.com", nome: "Ana Souza" };

describe("validarSenha", () => {
  it("aceita senha de 8 caracteres que não é óbvia", () => {
    expect(validarSenha("cadeira7", contexto)).toEqual({ valida: true });
  });

  it("recusa senha com menos de 8 caracteres", () => {
    expect(validarSenha("abc1234", contexto)).toEqual({
      valida: false,
      motivo: "curta",
    });
  });

  it("recusa senha com mais de 128 caracteres", () => {
    expect(validarSenha("a1".repeat(65), contexto)).toEqual({
      valida: false,
      motivo: "longa",
    });
  });

  it("aceita senha com exatamente 128 caracteres", () => {
    expect(validarSenha("tesoura9".repeat(16), contexto)).toEqual({
      valida: true,
    });
  });

  it.each(["12345678", "password", "senha123", "SENHA123", "Qwerty123"])(
    "recusa a senha comum %s",
    (senha) => {
      expect(validarSenha(senha, contexto)).toEqual({
        valida: false,
        motivo: "comum",
      });
    },
  );

  it("recusa senha igual ao e-mail, sem diferenciar maiúsculas", () => {
    expect(
      validarSenha("ANA@exemplo.com", { email: "ana@exemplo.com", nome: "X" }),
    ).toEqual({ valida: false, motivo: "igual_ao_email" });
  });

  it("recusa senha igual ao nome, sem diferenciar maiúsculas", () => {
    expect(
      validarSenha("ana souza", { email: "x@exemplo.com", nome: "Ana Souza" }),
    ).toEqual({ valida: false, motivo: "igual_ao_nome" });
  });

  it("não impõe regras de composição", () => {
    expect(validarSenha("apenasletras", contexto)).toEqual({ valida: true });
  });
});
