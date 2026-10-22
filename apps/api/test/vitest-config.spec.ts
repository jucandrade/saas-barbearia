import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("vitest.config.ts", () => {
  it("does not include integration tests, so `pnpm test` never opens a database connection", () => {
    expect(config.test?.exclude).toContain("test/integration/**");
  });
});
