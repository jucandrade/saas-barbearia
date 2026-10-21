import { describe, expect, it } from "vitest";
import {
  ConvidarEntrada,
  ConvidarSaida,
  EquipeSaida,
  ReenviarSaida,
} from "../src/index.js";

const uuid = "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10";
const usuario = {
  id: uuid,
  nome: "Bia",
  email: "bia@exemplo.com",
  papel: "barbeiro",
  situacao: "convidado",
  barbeariaId: uuid,
};

describe("ConvidarEntrada", () => {
  const valida = {
    nome: "Bia Lima",
    email: " BIA@Exemplo.com ",
    papel: "barbeiro",
  };

  it("normaliza o e-mail e aceita os dois papéis", () => {
    expect(ConvidarEntrada.parse(valida).email).toBe("bia@exemplo.com");
    expect(
      ConvidarEntrada.safeParse({ ...valida, papel: "dono" }).success,
    ).toBe(true);
  });

  it("recusa nome vazio, com mais de 120 caracteres, e-mail inválido e papel desconhecido", () => {
    expect(ConvidarEntrada.safeParse({ ...valida, nome: "  " }).success).toBe(
      false,
    );
    expect(
      ConvidarEntrada.safeParse({ ...valida, nome: "x".repeat(121) }).success,
    ).toBe(false);
    expect(ConvidarEntrada.safeParse({ ...valida, email: "bia" }).success).toBe(
      false,
    );
    expect(
      ConvidarEntrada.safeParse({ ...valida, papel: "gerente" }).success,
    ).toBe(false);
  });
});

describe("saídas da equipe", () => {
  it("EquipeSaida lista usuários", () => {
    expect(EquipeSaida.parse({ usuarios: [usuario] }).usuarios).toHaveLength(1);
    expect(
      EquipeSaida.safeParse({
        usuarios: [{ ...usuario, situacao: "anonimizado" }],
      }).success,
    ).toBe(false);
  });

  it("ConvidarSaida e ReenviarSaida informam se o e-mail foi enviado", () => {
    expect(
      ConvidarSaida.parse({ usuario, conviteEnviado: true }).conviteEnviado,
    ).toBe(true);
    expect(ConvidarSaida.safeParse({ usuario }).success).toBe(false);
    expect(ReenviarSaida.parse({ conviteEnviado: false }).conviteEnviado).toBe(
      false,
    );
  });
});
