import { describe, expect, it } from "vitest";
import {
  calcularExpiracao,
  duracaoSessao,
  sessaoVigente,
} from "../../src/identidade/sessao.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const agora = new Date("2026-10-21T12:00:00.000Z");

describe("duracaoSessao", () => {
  it("dono: 12 horas", () => {
    expect(duracaoSessao("dono")).toBe(12 * HORA);
  });

  it("barbeiro: 30 dias", () => {
    expect(duracaoSessao("barbeiro")).toBe(30 * DIA);
  });
});

describe("calcularExpiracao", () => {
  it("soma a duração à hora recebida, sem ler o relógio", () => {
    expect(calcularExpiracao("dono", agora)).toEqual(
      new Date("2026-10-22T00:00:00.000Z"),
    );
    expect(calcularExpiracao("barbeiro", agora)).toEqual(
      new Date("2026-11-20T12:00:00.000Z"),
    );
  });

  it("não altera a data recebida", () => {
    const copia = new Date(agora);
    calcularExpiracao("dono", agora);
    expect(agora).toEqual(copia);
  });
});

describe("sessaoVigente", () => {
  const futura = new Date(agora.getTime() + HORA);

  it("é vigente quando não revogada e não expirada", () => {
    expect(sessaoVigente({ expiraEm: futura, revogadaEm: null }, agora)).toBe(
      true,
    );
  });

  it("não é vigente se revogada", () => {
    expect(sessaoVigente({ expiraEm: futura, revogadaEm: agora }, agora)).toBe(
      false,
    );
  });

  it("não é vigente se expirada, inclusive exatamente na hora de expirar", () => {
    expect(sessaoVigente({ expiraEm: agora, revogadaEm: null }, agora)).toBe(
      false,
    );
  });
});
