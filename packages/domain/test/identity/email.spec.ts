import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../../src/identity/email.js";

describe("normalizeEmail", () => {
  it("trims spaces and lowercases", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("keeps an already normalized e-mail identical", () => {
    expect(normalizeEmail("ana@example.com")).toBe("ana@example.com");
  });
});
