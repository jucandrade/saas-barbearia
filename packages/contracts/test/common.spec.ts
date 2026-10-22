import { describe, expect, it } from "vitest";
import { Email, ErrorBody, Role, User } from "../src/index.js";

const validUser = {
  id: "0f9b6d8e-6a1f-4c1e-9a53-3d1b8a7c2e10",
  name: "Ana Souza",
  email: "ana@example.com",
  role: "owner",
  status: "active",
  barbershopId: "7c1a2e44-5b0d-4f6a-8f0c-9d2e1a3b4c55",
};

describe("User", () => {
  it("accepts a valid user", () => {
    expect(User.parse(validUser)).toEqual(validUser);
  });

  it("recusa e-mail malformado", () => {
    expect(User.safeParse({ ...validUser, email: "ana@" }).success).toBe(false);
  });

  it("recusa papel desconhecido", () => {
    expect(User.safeParse({ ...validUser, role: "manager" }).success).toBe(
      false,
    );
  });

  it("rejects the anonymized status, which the API never exposes", () => {
    expect(User.safeParse({ ...validUser, status: "anonymized" }).success).toBe(
      false,
    );
  });

  it("does not let sensitive fields through", () => {
    const result = User.parse({ ...validUser, password_hash: "x" });
    expect(result).not.toHaveProperty("password_hash");
  });
});

describe("Email", () => {
  it("trims and lowercases", () => {
    expect(Email.parse("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

describe("Role", () => {
  it("aceita dono e barbeiro", () => {
    expect(Role.options).toEqual(["owner", "barber"]);
  });
});

describe("ErrorBody", () => {
  it("accepts an error with and without fields", () => {
    expect(ErrorBody.safeParse({ code: "X", message: "Text" }).success).toBe(
      true,
    );
    expect(
      ErrorBody.safeParse({
        code: "INVALID_DATA",
        message: "Text",
        fields: { email: "E-mail inválido" },
      }).success,
    ).toBe(true);
  });
});
