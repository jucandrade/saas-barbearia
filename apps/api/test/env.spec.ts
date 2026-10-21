import { describe, expect, it } from "vitest";
import { lerEnv } from "../src/config/env.js";

describe("lerEnv", () => {
  it("aplica os padrões de desenvolvimento", () => {
    const env = lerEnv({});
    expect(env.porta).toBe(3000);
    expect(env.databaseUrl).toBe(
      "postgres://app_runtime:app_runtime@localhost:5432/barbearia",
    );
    expect(env.databaseAdminUrl).toBe(
      "postgres://barbearia:barbearia@localhost:5432/barbearia",
    );
    expect(env.smtpUrl).toBe("smtp://localhost:1025");
    expect(env.adminBaseUrl).toBe("http://localhost:3001");
    expect(env.cookieSeguro).toBe(false);
    expect(env.limitePorMinuto).toBe(20);
    expect(env.argon2).toEqual({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  it("deriva as URLs do banco das variáveis POSTGRES_*", () => {
    const env = lerEnv({ POSTGRES_PORT: "5434", POSTGRES_DB: "teste" });
    expect(env.databaseUrl).toContain("@localhost:5434/teste");
    expect(env.databaseAdminUrl).toContain("@localhost:5434/teste");
  });

  it("respeita URLs explícitas e codifica senhas derivadas", () => {
    const env = lerEnv({
      DATABASE_URL: "postgres://x:y@host:1/db",
      POSTGRES_PASSWORD: "a b/c",
    });
    expect(env.databaseUrl).toBe("postgres://x:y@host:1/db");
    expect(env.databaseAdminUrl).toContain("a%20b%2Fc");
  });

  it("remove a barra final de ADMIN_BASE_URL", () => {
    expect(
      lerEnv({ ADMIN_BASE_URL: "https://admin.exemplo.com/" }).adminBaseUrl,
    ).toBe("https://admin.exemplo.com");
  });

  it("falha com mensagem clara para valor inválido", () => {
    expect(() => lerEnv({ SESSION_COOKIE_SECURE: "talvez" })).toThrow(
      /Configuração de ambiente inválida.*SESSION_COOKIE_SECURE/,
    );
    expect(() => lerEnv({ PORT: "abc" })).toThrow(/PORT/);
  });
});
