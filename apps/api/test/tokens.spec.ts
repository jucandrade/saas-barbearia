import { describe, expect, it } from "vitest";
import { gerarToken, hashToken } from "../src/identidade/seguranca/tokens.js";

describe("tokens", () => {
  it("gera tokens distintos de 256 bits", () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("gera apenas caracteres seguros para URL e cookie", () => {
    expect(gerarToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("o hash é determinístico e diferente do token", () => {
    const token = gerarToken();
    expect(hashToken(token).equals(hashToken(token))).toBe(true);
    expect(hashToken(token).toString("base64url")).not.toBe(token);
    expect(hashToken(token)).toHaveLength(32);
  });

  it("tokens diferentes têm hashes diferentes", () => {
    expect(hashToken("a").equals(hashToken("b"))).toBe(false);
  });
});
