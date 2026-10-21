import { describe, expect, it } from "vitest";
import {
  avaliarTentativaLogin,
  DURACAO_BLOQUEIO_MS,
  MAX_FALHAS_LOGIN,
  registrarFalhaLogin,
  registrarSucessoLogin,
  type EstadoLogin,
} from "../../src/identidade/bloqueio.js";

const agora = new Date("2026-10-21T12:00:00.000Z");
const limpo: EstadoLogin = { tentativasFalhas: 0, bloqueadoAte: null };

describe("constantes", () => {
  it("5 falhas seguidas e bloqueio de 15 minutos", () => {
    expect(MAX_FALHAS_LOGIN).toBe(5);
    expect(DURACAO_BLOQUEIO_MS).toBe(15 * 60 * 1000);
  });
});

describe("registrarFalhaLogin", () => {
  it("incrementa tentativasFalhas sem bloquear antes da 5ª", () => {
    const estado = registrarFalhaLogin(
      { ...limpo, tentativasFalhas: 3 },
      agora,
    );
    expect(estado).toEqual({ tentativasFalhas: 4, bloqueadoAte: null });
  });

  it("a 5ª falha seguida bloqueia por 15 minutos", () => {
    const estado = registrarFalhaLogin(
      { ...limpo, tentativasFalhas: 4 },
      agora,
    );
    expect(estado.tentativasFalhas).toBe(5);
    expect(estado.bloqueadoAte).toEqual(new Date("2026-10-21T12:15:00.000Z"));
  });

  it("não altera o estado enquanto a conta já está bloqueada", () => {
    const bloqueado: EstadoLogin = {
      tentativasFalhas: 5,
      bloqueadoAte: new Date("2026-10-21T12:10:00.000Z"),
    };
    expect(registrarFalhaLogin(bloqueado, agora)).toEqual(bloqueado);
  });

  it("não muta o estado recebido", () => {
    const entrada = { ...limpo, tentativasFalhas: 1 };
    registrarFalhaLogin(entrada, agora);
    expect(entrada).toEqual({ tentativasFalhas: 1, bloqueadoAte: null });
  });
});

describe("avaliarTentativaLogin", () => {
  it("está liberado sem bloqueio", () => {
    expect(avaliarTentativaLogin(limpo, agora)).toEqual({
      bloqueado: false,
      estado: limpo,
    });
  });

  it("está bloqueado enquanto bloqueadoAte estiver no futuro", () => {
    const estado: EstadoLogin = {
      tentativasFalhas: 5,
      bloqueadoAte: new Date("2026-10-21T12:00:00.001Z"),
    };
    expect(avaliarTentativaLogin(estado, agora)).toEqual({ bloqueado: true });
  });

  it("libera e zera o contador quando o bloqueio já passou, inclusive na hora exata", () => {
    const estado: EstadoLogin = { tentativasFalhas: 5, bloqueadoAte: agora };
    expect(avaliarTentativaLogin(estado, agora)).toEqual({
      bloqueado: false,
      estado: limpo,
    });
  });
});

describe("registrarSucessoLogin", () => {
  it("zera tentativasFalhas e bloqueadoAte", () => {
    expect(registrarSucessoLogin()).toEqual(limpo);
  });
});
