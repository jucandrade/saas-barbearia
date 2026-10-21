import { describe, expect, it } from "vitest";
import {
  AceitarConviteEntrada,
  ConviteInfo,
  EuSaida,
  ProvisionarBarbeariaComando,
  SessaoSaida,
} from "../src/index.js";

const uuid = "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10";
const usuario = {
  id: uuid,
  nome: "Ana",
  email: "ana@exemplo.com",
  papel: "dono",
  situacao: "ativo",
  barbeariaId: uuid,
};

describe("convite", () => {
  it("ConviteInfo exige nome e barbearia", () => {
    expect(
      ConviteInfo.safeParse({ nome: "Ana", barbearia: "Piloto" }).success,
    ).toBe(true);
    expect(ConviteInfo.safeParse({ nome: "Ana" }).success).toBe(false);
  });

  it("AceitarConviteEntrada aceita web e mobile e recusa outro cliente", () => {
    const base = { token: "t", senha: "cadeira7" };
    expect(
      AceitarConviteEntrada.safeParse({ ...base, cliente: "web" }).success,
    ).toBe(true);
    expect(
      AceitarConviteEntrada.safeParse({ ...base, cliente: "mobile" }).success,
    ).toBe(true);
    expect(
      AceitarConviteEntrada.safeParse({ ...base, cliente: "desktop" }).success,
    ).toBe(false);
    expect(AceitarConviteEntrada.safeParse({ ...base }).success).toBe(false);
  });

  it("SessaoSaida tem token opcional", () => {
    expect(SessaoSaida.safeParse({ usuario }).success).toBe(true);
    expect(SessaoSaida.safeParse({ usuario, token: "abc" }).success).toBe(true);
  });
});

describe("ProvisionarBarbeariaComando", () => {
  const valido = {
    nome: "Barbearia Piloto",
    unidade: "Matriz",
    fuso: "America/Sao_Paulo",
    donoNome: "Dona Ana",
    donoEmail: "  Ana@Exemplo.com ",
  };

  it("normaliza o e-mail do dono", () => {
    expect(ProvisionarBarbeariaComando.parse(valido).donoEmail).toBe(
      "ana@exemplo.com",
    );
  });

  it("recusa nome com mais de 120 caracteres e e-mail malformado", () => {
    expect(
      ProvisionarBarbeariaComando.safeParse({
        ...valido,
        nome: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      ProvisionarBarbeariaComando.safeParse({ ...valido, donoEmail: "ana@" })
        .success,
    ).toBe(false);
    expect(
      ProvisionarBarbeariaComando.safeParse({ ...valido, unidade: "" }).success,
    ).toBe(false);
  });
});

describe("EuSaida", () => {
  it("devolve usuário e barbearia com unidades", () => {
    const eu = {
      usuario,
      barbearia: {
        id: uuid,
        nome: "Piloto",
        unidades: [
          { id: uuid, nome: "Matriz", fusoHorario: "America/Sao_Paulo" },
        ],
      },
    };
    expect(EuSaida.parse(eu)).toEqual(eu);
  });
});

describe("LoginEntrada", () => {
  it("normaliza o e-mail e exige o cliente", async () => {
    const { LoginEntrada } = await import("../src/index.js");
    expect(
      LoginEntrada.parse({
        email: " Ana@Exemplo.com ",
        senha: "x",
        cliente: "web",
      }).email,
    ).toBe("ana@exemplo.com");
    expect(
      LoginEntrada.safeParse({ email: "ana@exemplo.com", senha: "x" }).success,
    ).toBe(false);
    expect(
      LoginEntrada.safeParse({ email: "ana", senha: "x", cliente: "web" })
        .success,
    ).toBe(false);
    expect(
      LoginEntrada.safeParse({
        email: "ana@exemplo.com",
        senha: "",
        cliente: "web",
      }).success,
    ).toBe(false);
  });
});
