import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "../src/identity/security/tokens.js";

describe("tokens", () => {
  it("generates distinct 256-bit tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("generates only URL- and cookie-safe characters", () => {
    expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("the hash is deterministic and different from the token", () => {
    const token = generateToken();
    expect(hashToken(token).equals(hashToken(token))).toBe(true);
    expect(hashToken(token).toString("base64url")).not.toBe(token);
    expect(hashToken(token)).toHaveLength(32);
  });

  it("different tokens have different hashes", () => {
    expect(hashToken("a").equals(hashToken("b"))).toBe(false);
  });
});
