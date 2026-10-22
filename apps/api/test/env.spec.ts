import { describe, expect, it } from "vitest";
import { readEnv } from "../src/config/env.js";

describe("readEnv", () => {
  it("applies the development defaults", () => {
    const env = readEnv({});
    expect(env.port).toBe(3000);
    expect(env.databaseUrl).toBe(
      "postgres://app_runtime:app_runtime@localhost:5432/barbearia",
    );
    expect(env.databaseAdminUrl).toBe(
      "postgres://barbearia:barbearia@localhost:5432/barbearia",
    );
    expect(env.smtpUrl).toBe("smtp://localhost:1025");
    expect(env.adminBaseUrl).toBe("http://localhost:3001");
    expect(env.secureCookie).toBe(false);
    expect(env.limitPerMinute).toBe(20);
    expect(env.recoveryFloorMs).toBe(250);
    expect(env.argon2).toEqual({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it("derives the database URLs from the POSTGRES_* variables", () => {
    const env = readEnv({ POSTGRES_PORT: "5434", POSTGRES_DB: "test" });
    expect(env.databaseUrl).toContain("@localhost:5434/test");
    expect(env.databaseAdminUrl).toContain("@localhost:5434/test");
  });

  it("respects explicit URLs and encodes derived passwords", () => {
    const env = readEnv({
      DATABASE_URL: "postgres://x:y@host:1/db",
      POSTGRES_PASSWORD: "a b/c",
    });
    expect(env.databaseUrl).toBe("postgres://x:y@host:1/db");
    expect(env.databaseAdminUrl).toContain("a%20b%2Fc");
  });

  it("strips the trailing slash from ADMIN_BASE_URL", () => {
    expect(
      readEnv({ ADMIN_BASE_URL: "https://admin.example.com/" }).adminBaseUrl,
    ).toBe("https://admin.example.com");
  });

  it("fails with a clear message for an invalid value", () => {
    expect(() => readEnv({ SESSION_COOKIE_SECURE: "maybe" })).toThrow(
      /Invalid environment configuration.*SESSION_COOKIE_SECURE/,
    );
    expect(() => readEnv({ PORT: "abc" })).toThrow(/PORT/);
  });
});
