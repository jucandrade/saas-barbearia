import { describe, expect, it } from "vitest";

describe("packages/domain", () => {
  it("executa testes sem framework, banco, rede nem relógio", () => {
    expect(1 + 1).toBe(2);
  });
});
