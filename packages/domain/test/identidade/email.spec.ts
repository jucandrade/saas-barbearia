import { describe, expect, it } from "vitest";
import { normalizarEmail } from "../../src/identidade/email.js";

describe("normalizarEmail", () => {
  it("apara espaços e converte para minúsculas", () => {
    expect(normalizarEmail("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });

  it("mantém um e-mail já normalizado idêntico", () => {
    expect(normalizarEmail("ana@exemplo.com")).toBe("ana@exemplo.com");
  });
});
