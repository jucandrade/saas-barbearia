import { describe, expect, it } from "vitest";
import { readEnv } from "../src/config/env.js";
import { PasswordService } from "../src/identity/security/password.service.js";

// Low parameters only to keep the test fast; the defaults are OWASP's.
const service = new PasswordService(
  readEnv({
    ARGON2_MEMORY_KIB: "1024",
    ARGON2_TIME_COST: "1",
    ARGON2_PARALLELISM: "1",
  }),
);

describe("PasswordService", () => {
  it("produces an argon2id hash with the configured parameters, never the password", async () => {
    const hash = await service.hash("some password");
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(hash).toContain("m=1024");
    expect(hash).toContain("t=1");
    expect(hash).toContain("p=1");
    expect(hash).not.toContain("some password");
  });

  it("produces different hashes for the same password (random salt)", async () => {
    expect(await service.hash("repeated")).not.toBe(
      await service.hash("repeated"),
    );
  });

  it("verifica a senha certa e recusa a errada", async () => {
    const hash = await service.hash("cadeira7");
    expect(await service.verify(hash, "cadeira7")).toBe(true);
    expect(await service.verify(hash, "cadeira8")).toBe(false);
  });

  it("an invalid hash is rejected without throwing", async () => {
    expect(await service.verify("this-is-not-a-hash", "x")).toBe(false);
  });

  it("the dummy verification returns false", async () => {
    expect(await service.verifyDummyPassword("any")).toBe(false);
  });
});
