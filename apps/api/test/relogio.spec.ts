import { describe, expect, it } from "vitest";
import {
  RelogioControlavel,
  RelogioDoSistema,
} from "../src/identidade/relogio.js";

describe("RelogioDoSistema", () => {
  it("devolve a hora atual", () => {
    const antes = Date.now();
    const agora = new RelogioDoSistema().agora().getTime();
    expect(agora).toBeGreaterThanOrEqual(antes);
    expect(agora).toBeLessThanOrEqual(Date.now());
  });
});

describe("RelogioControlavel", () => {
  it("fica parado até ser avançado", () => {
    const relogio = new RelogioControlavel(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(relogio.agora()).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    relogio.avancar(15 * 60 * 1000);
    expect(relogio.agora()).toEqual(new Date("2026-01-01T00:15:00.000Z"));
  });

  it("pode ser definido para uma data", () => {
    const relogio = new RelogioControlavel();
    relogio.definir(new Date("2027-05-05T10:00:00.000Z"));
    expect(relogio.agora()).toEqual(new Date("2027-05-05T10:00:00.000Z"));
  });

  it("não expõe o estado interno por mutação", () => {
    const relogio = new RelogioControlavel(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    relogio.agora().setFullYear(2000);
    expect(relogio.agora().getUTCFullYear()).toBe(2026);
  });
});
