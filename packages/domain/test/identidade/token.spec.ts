import { describe, expect, it } from "vitest";
import {
  calcularExpiracaoToken,
  tokenVigente,
  VALIDADE_CONVITE_MS,
  VALIDADE_RECUPERACAO_MS,
} from "../../src/identidade/token.js";

const agora = new Date("2026-10-21T12:00:00.000Z");
const futuro = new Date(agora.getTime() + 1000);

describe("validades", () => {
  it("convite: 7 dias; recuperação: 1 hora", () => {
    expect(VALIDADE_CONVITE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(VALIDADE_RECUPERACAO_MS).toBe(60 * 60 * 1000);
  });
});

describe("calcularExpiracaoToken", () => {
  it("soma a validade da finalidade à hora recebida", () => {
    expect(calcularExpiracaoToken("convite", agora)).toEqual(
      new Date("2026-10-28T12:00:00.000Z"),
    );
    expect(calcularExpiracaoToken("recuperacao", agora)).toEqual(
      new Date("2026-10-21T13:00:00.000Z"),
    );
  });
});

describe("tokenVigente", () => {
  it("é vigente quando não usado, não invalidado e não expirado", () => {
    expect(
      tokenVigente(
        { expiraEm: futuro, usadoEm: null, invalidadoEm: null },
        agora,
      ),
    ).toBe(true);
  });

  it("não é vigente se já usado", () => {
    expect(
      tokenVigente(
        { expiraEm: futuro, usadoEm: agora, invalidadoEm: null },
        agora,
      ),
    ).toBe(false);
  });

  it("não é vigente se invalidado por um token mais novo", () => {
    expect(
      tokenVigente(
        { expiraEm: futuro, usadoEm: null, invalidadoEm: agora },
        agora,
      ),
    ).toBe(false);
  });

  it("expirar exatamente em agora já é inválido", () => {
    expect(
      tokenVigente(
        { expiraEm: agora, usadoEm: null, invalidadoEm: null },
        agora,
      ),
    ).toBe(false);
  });
});
