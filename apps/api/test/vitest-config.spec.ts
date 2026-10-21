import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("vitest.config.ts", () => {
  it("não inclui os testes de integração, para `pnpm test` nunca abrir conexão com o banco", () => {
    expect(config.test?.exclude).toContain("test/integration/**");
  });
});
