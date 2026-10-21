import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MeOutput, SessionOutput } from "@barbearia/contracts";
import { PasswordService } from "../../../src/identity/security/password.service.js";
import { createApp, type TestApp } from "../helpers/app.js";
import {
  expectCovers,
  expectError,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import { createBarbershop, createUser } from "../helpers/factory.js";

const PASSWORD = "barber-chair-secret";
const covered = new Set<string>();

describe("contract: auth", () => {
  let t: TestApp;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    t = await createApp();
    ({ barbershopId: tenantId } = await createBarbershop("Contract Auth"));
    userId = await createUser({
      tenantId,
      email: "contract-auth@example.com",
      role: "owner",
      passwordHash: await t.app.get(PasswordService).hash(PASSWORD),
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("POST /auth/login: 200 SessionOutput, 401 INVALID_CREDENTIALS, 400 INVALID_DATA", async () => {
    covered.add("post /auth/login");
    const ok = await t.http().post("/auth/login").send({
      email: "contract-auth@example.com",
      password: PASSWORD,
      client: "mobile",
    });
    expect(ok.status).toBe(successStatus("post", "/auth/login"));
    expect(SessionOutput.parse(ok.body).token).toBeDefined();

    expectError(
      await t.http().post("/auth/login").send({
        email: "contract-auth@example.com",
        password: "x",
        client: "web",
      }),
      401,
      "INVALID_CREDENTIALS",
    );
    const invalid = expectError(
      await t
        .http()
        .post("/auth/login")
        .send({ email: "not-an-email", client: "web" }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {}).sort()).toEqual([
      "email",
      "password",
    ]);
  });

  it("GET /auth/me: 200 MeOutput, 401 INVALID_SESSION", async () => {
    covered.add("get /auth/me");
    const token = await t.openSession({ id: userId, tenantId, role: "owner" });
    const ok = await t
      .http()
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(ok.status).toBe(successStatus("get", "/auth/me"));
    expect(MeOutput.parse(ok.body).barbershop.id).toBe(tenantId);

    expectError(await t.http().get("/auth/me"), 401, "INVALID_SESSION");
  });

  it("POST /auth/logout: 204 without a body, 401 INVALID_SESSION", async () => {
    covered.add("post /auth/logout");
    const token = await t.openSession({ id: userId, tenantId, role: "owner" });
    const ok = await t
      .http()
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(ok.status).toBe(successStatus("post", "/auth/logout"));
    expect(ok.text).toBe("");

    expectError(await t.http().post("/auth/logout"), 401, "INVALID_SESSION");
  });

  it("covers every /auth/login, /auth/logout and /auth/me route of the registry", () => {
    expectCovers(["/auth/login", "/auth/logout", "/auth/me"], covered);
  });
});
