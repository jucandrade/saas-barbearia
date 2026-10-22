import { describe, expect, it } from "vitest";
import { normalizeName } from "../../src/catalog/name.js";

describe("normalizeName", () => {
  it("trims spaces at both ends", () => {
    expect(normalizeName("  Corte  ")).toBe("corte");
  });

  it("is case-insensitive", () => {
    expect(normalizeName("CORTE")).toBe(normalizeName("corte"));
    expect(normalizeName("Corte ")).toBe(normalizeName("corte"));
  });

  it("lowercases accented letters", () => {
    expect(normalizeName("BARBA ÁGIL")).toBe("barba ágil");
  });

  it("treats composed and decomposed accents as the same name", () => {
    const composed = "Pé";
    const decomposed = "Pé";
    expect(composed).not.toBe(decomposed);
    expect(normalizeName(decomposed)).toBe(normalizeName(composed));
  });

  it("keeps inner spaces, so different names stay different", () => {
    expect(normalizeName("Barba")).not.toBe(normalizeName("Barba Completa"));
    expect(normalizeName("Corte  Barba")).toBe("corte  barba");
  });
});
