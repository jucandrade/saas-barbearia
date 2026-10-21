import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvitationInfo, SessionOutput } from "@barbearia/contracts";
import { createApp, type TestApp } from "../helpers/app.js";
import {
  expectCovers,
  expectError,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import {
  createAccessToken,
  createBarbershop,
  createUser,
} from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: invitations", () => {
  let t: TestApp;
  let tenantId: string;
  let counter = 0;

  beforeAll(async () => {
    t = await createApp();
    ({ barbershopId: tenantId } = await createBarbershop(
      "Contract Invitations",
    ));
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function invitation(): Promise<string> {
    counter += 1;
    const userId = await createUser({
      tenantId,
      name: "Contract Invitee",
      email: `contract-inv-${String(counter)}@example.com`,
      role: "barber",
      status: "invited",
    });
    return createAccessToken({
      tenantId,
      userId,
      expiresAt: new Date(t.clock.now().getTime() + 60_000),
    });
  }

  it("GET /auth/invitations/{token}: 200 InvitationInfo, 410 INVALID_INVITATION", async () => {
    covered.add("get /auth/invitations/{token}");
    const token = await invitation();
    const ok = await t.http().get(`/auth/invitations/${token}`);
    expect(ok.status).toBe(successStatus("get", "/auth/invitations/{token}"));
    expect(InvitationInfo.parse(ok.body)).toEqual({
      name: "Contract Invitee",
      barbershop: "Contract Invitations",
    });

    expectError(
      await t.http().get("/auth/invitations/not-a-real-token"),
      410,
      "INVALID_INVITATION",
    );
  });

  it("POST /auth/invitations/accept: 200 SessionOutput, 400 WEAK_PASSWORD with the field, 410, 400 INVALID_DATA", async () => {
    covered.add("post /auth/invitations/accept");
    const weak = expectError(
      await t
        .http()
        .post("/auth/invitations/accept")
        .send({
          token: await invitation(),
          password: "12345678",
          client: "web",
        }),
      400,
      "WEAK_PASSWORD",
    );
    expect(Object.keys(weak.fields ?? {})).toEqual(["password"]);

    const ok = await t
      .http()
      .post("/auth/invitations/accept")
      .send({
        token: await invitation(),
        password: "barber-chair-secret",
        client: "mobile",
      });
    expect(ok.status).toBe(successStatus("post", "/auth/invitations/accept"));
    expect(SessionOutput.parse(ok.body).user.status).toBe("active");

    expectError(
      await t.http().post("/auth/invitations/accept").send({
        token: "not-a-real-token",
        password: "barber-chair-secret",
        client: "web",
      }),
      410,
      "INVALID_INVITATION",
    );
    expectError(
      await t.http().post("/auth/invitations/accept").send({ password: "x" }),
      400,
      "INVALID_DATA",
    );
  });

  it("covers every /auth/invitations route of the registry", () => {
    expectCovers(["/auth/invitations"], covered);
  });
});
