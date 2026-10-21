import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForgotOutput, RECOVERY_MESSAGE } from "@barbearia/contracts";
import { createApp, type TestApp } from "../helpers/app.js";
import {
  expectCovers,
  expectError,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import { createBarbershop, createUser } from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: password recovery", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
    const { barbershopId: tenantId } =
      await createBarbershop("Contract Password");
    await createUser({
      tenantId,
      email: "contract-password@example.com",
      role: "barber",
      passwordHash: "stored-hash",
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("POST /auth/password/forgot: 202 ForgotOutput, 400 INVALID_DATA", async () => {
    covered.add("post /auth/password/forgot");
    const ok = await t
      .http()
      .post("/auth/password/forgot")
      .send({ email: "contract-password@example.com" });
    expect(ok.status).toBe(successStatus("post", "/auth/password/forgot"));
    expect(ForgotOutput.parse(ok.body).message).toBe(RECOVERY_MESSAGE);

    expectError(
      await t
        .http()
        .post("/auth/password/forgot")
        .send({ email: "not-an-email" }),
      400,
      "INVALID_DATA",
    );
  });

  it("POST /auth/password/reset: 204 without a body, 410 INVALID_TOKEN, 400 INVALID_DATA", async () => {
    covered.add("post /auth/password/reset");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const token =
      /\/reset-password\/([A-Za-z0-9_-]+)/.exec(
        t.email.lastTo("contract-password@example.com")?.text ?? "",
      )?.[1] ?? "";
    const ok = await t
      .http()
      .post("/auth/password/reset")
      .send({ token, password: "scissors-well-sharp-7" });
    expect(ok.status).toBe(successStatus("post", "/auth/password/reset"));
    expect(ok.text).toBe("");

    expectError(
      await t
        .http()
        .post("/auth/password/reset")
        .send({ token: "not-a-real-token", password: "scissors-well-sharp-7" }),
      410,
      "INVALID_TOKEN",
    );
    expectError(
      await t.http().post("/auth/password/reset").send({ password: "x" }),
      400,
      "INVALID_DATA",
    );
  });

  it("covers every /auth/password route of the registry", () => {
    expectCovers(["/auth/password"], covered);
  });
});
