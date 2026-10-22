import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InviteOutput, ResendOutput, TeamOutput } from "@barbearia/contracts";
import { createApp, type TestApp } from "../helpers/app.js";
import {
  expectCovers,
  expectError,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import { createBarbershop, createUser } from "../helpers/factory.js";

const covered = new Set<string>();
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

describe("contract: team", () => {
  let t: TestApp;
  let owner: { Authorization: string };
  let barber: { Authorization: string };
  let barberId: string;
  let ownerId: string;

  beforeAll(async () => {
    t = await createApp();
    const { barbershopId: tenantId } = await createBarbershop("Contract Team");
    ownerId = await createUser({
      tenantId,
      email: "contract-team-owner@example.com",
      role: "owner",
    });
    barberId = await createUser({
      tenantId,
      email: "contract-team-barber@example.com",
      role: "barber",
    });
    owner = {
      Authorization: `Bearer ${await t.openSession({ id: ownerId, tenantId, role: "owner" })}`,
    };
    barber = {
      Authorization: `Bearer ${await t.openSession({ id: barberId, tenantId, role: "barber" })}`,
    };
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("GET /team: 200 TeamOutput, 403 NO_PERMISSION for a barber, 401 without a session", async () => {
    covered.add("get /team");
    const ok = await t.http().get("/team").set(owner);
    expect(ok.status).toBe(successStatus("get", "/team"));
    expect(TeamOutput.parse(ok.body).users).toHaveLength(2);

    expectError(await t.http().get("/team").set(barber), 403, "NO_PERMISSION");
    expectError(await t.http().get("/team"), 401, "INVALID_SESSION");
  });

  it("POST /team/invitations: 201 InviteOutput, 409 EMAIL_UNAVAILABLE, 400 INVALID_DATA", async () => {
    covered.add("post /team/invitations");
    const body = {
      name: "Contract New",
      email: "contract-team-new@example.com",
      role: "barber",
    };
    const ok = await t.http().post("/team/invitations").set(owner).send(body);
    expect(ok.status).toBe(successStatus("post", "/team/invitations"));
    expect(InviteOutput.parse(ok.body).user.status).toBe("invited");

    expectError(
      await t.http().post("/team/invitations").set(owner).send(body),
      409,
      "EMAIL_UNAVAILABLE",
    );
    const invalid = expectError(
      await t
        .http()
        .post("/team/invitations")
        .set(owner)
        .send({ name: "", email: "x", role: "boss" }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {}).sort()).toEqual([
      "email",
      "name",
      "role",
    ]);
  });

  it("POST /team/{id}/resend-invitation: 200 ResendOutput, 409 USER_NOT_INVITED, 404 NOT_FOUND", async () => {
    covered.add("post /team/{id}/resend-invitation");
    const invited = InviteOutput.parse(
      (
        await t.http().post("/team/invitations").set(owner).send({
          name: "Contract Resend",
          email: "contract-team-resend@example.com",
          role: "barber",
        })
      ).body,
    );
    const ok = await t
      .http()
      .post(`/team/${invited.user.id}/resend-invitation`)
      .set(owner);
    expect(ok.status).toBe(
      successStatus("post", "/team/{id}/resend-invitation"),
    );
    expect(ResendOutput.parse(ok.body).invitationSent).toBe(true);

    expectError(
      await t.http().post(`/team/${barberId}/resend-invitation`).set(owner),
      409,
      "USER_NOT_INVITED",
    );
    expectError(
      await t.http().post(`/team/${NONEXISTENT}/resend-invitation`).set(owner),
      404,
      "NOT_FOUND",
    );
  });

  it("POST /team/{id}/deactivate and /reactivate: 204 without a body; 409 LAST_OWNER, USER_NOT_DEACTIVATED; 404", async () => {
    covered.add("post /team/{id}/deactivate");
    covered.add("post /team/{id}/reactivate");
    expectError(
      await t.http().post(`/team/${barberId}/reactivate`).set(owner),
      409,
      "USER_NOT_DEACTIVATED",
    );

    const off = await t.http().post(`/team/${barberId}/deactivate`).set(owner);
    expect(off.status).toBe(successStatus("post", "/team/{id}/deactivate"));
    expect(off.text).toBe("");

    const on = await t.http().post(`/team/${barberId}/reactivate`).set(owner);
    expect(on.status).toBe(successStatus("post", "/team/{id}/reactivate"));
    expect(on.text).toBe("");

    expectError(
      await t.http().post(`/team/${ownerId}/deactivate`).set(owner),
      409,
      "LAST_OWNER",
    );
    expectError(
      await t.http().post(`/team/${NONEXISTENT}/deactivate`).set(owner),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().post(`/team/${NONEXISTENT}/reactivate`).set(owner),
      404,
      "NOT_FOUND",
    );
  });

  it("covers every /team route of the registry", () => {
    expectCovers(["/team"], covered);
  });
});
