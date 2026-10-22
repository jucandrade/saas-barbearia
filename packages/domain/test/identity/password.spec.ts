import { describe, expect, it } from "vitest";
import { validatePassword } from "../../src/identity/password.js";

const context = { email: "ana@example.com", name: "Ana Souza" };

describe("validatePassword", () => {
  it("accepts an 8-character password that is not obvious", () => {
    expect(validatePassword("cadeira7", context)).toEqual({ valid: true });
  });

  it("rejects a password under 8 characters", () => {
    expect(validatePassword("abc1234", context)).toEqual({
      valid: false,
      reason: "short",
    });
  });

  it("rejects a password over 128 characters", () => {
    expect(validatePassword("a1".repeat(65), context)).toEqual({
      valid: false,
      reason: "long",
    });
  });

  it("accepts a password of exactly 128 characters", () => {
    expect(validatePassword("tesoura9".repeat(16), context)).toEqual({
      valid: true,
    });
  });

  it.each(["12345678", "password", "senha123", "SENHA123", "Qwerty123"])(
    "recusa a senha comum %s",
    (password) => {
      expect(validatePassword(password, context)).toEqual({
        valid: false,
        reason: "common",
      });
    },
  );

  it("rejects a password equal to the e-mail, ignoring case", () => {
    expect(
      validatePassword("ANA@example.com", {
        email: "ana@example.com",
        name: "X",
      }),
    ).toEqual({ valid: false, reason: "equals_email" });
  });

  it("rejects a password equal to the name, ignoring case", () => {
    expect(
      validatePassword("ana souza", {
        email: "x@example.com",
        name: "Ana Souza",
      }),
    ).toEqual({ valid: false, reason: "equals_name" });
  });

  it("imposes no composition rules", () => {
    expect(validatePassword("lettersonly", context)).toEqual({ valid: true });
  });
});
