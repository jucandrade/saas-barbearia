import { describe, expect, it } from "vitest";
import {
  ForgotInput,
  ForgotOutput,
  RECOVERY_MESSAGE,
  ResetInput,
} from "../src/index.js";

describe("password recovery", () => {
  it("EsqueciEntrada normaliza o e-mail e recusa malformado", () => {
    expect(ForgotInput.parse({ email: " Ana@Example.com " }).email).toBe(
      "ana@example.com",
    );
    expect(ForgotInput.safeParse({ email: "ana" }).success).toBe(false);
    expect(ForgotInput.safeParse({}).success).toBe(false);
  });

  it("the response message is fixed and does not mention the account", () => {
    expect(ForgotOutput.parse({ message: RECOVERY_MESSAGE }).message).toBe(
      "Se o e-mail estiver cadastrado, enviaremos as instruções.",
    );
  });

  it("RedefinirEntrada exige token e senha", () => {
    expect(
      ResetInput.safeParse({ token: "t", password: "cadeira7" }).success,
    ).toBe(true);
    expect(
      ResetInput.safeParse({ token: "", password: "cadeira7" }).success,
    ).toBe(false);
    expect(ResetInput.safeParse({ token: "t" }).success).toBe(false);
  });
});
