import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SessionOutput } from "@barbearia/contracts";
import { securityEvent } from "../../src/db/schema/index.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { closeConnections, withTenantAdmin } from "./helpers/db.js";
import {
  createPlatformTools,
  invitationTokenFrom,
} from "./helpers/platform.js";

const PASSWORD = "barber-chair-secret";
const NEW_PASSWORD = "scissors-well-sharp-7";

/** The 11 event types of FR-020 / SC-006. */
const ALL_TYPES = [
  "barbershop_provisioned",
  "invitation_sent",
  "invitation_accepted",
  "login_success",
  "login_failure",
  "logout",
  "password_recovery_requested",
  "password_reset",
  "user_deactivated",
  "user_reactivated",
  "user_anonymized",
] as const;

describe("complete audit trail (SC-006)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("records one event of each of the 11 types, with actor and time, and no personal data", async () => {
    // Product-team side: provisioning and anonymization (admin connection).
    const tools = createPlatformTools();
    const { barbershopId } = await tools.provisioning.provision({
      name: "Full Audit Barbershop",
      unit: "Main",
      timezone: "America/Sao_Paulo",
      ownerName: "Audit Owner Person",
      ownerEmail: "audit-owner@example.com",
    });
    const ownerInvitation = invitationTokenFrom(
      tools.email.lastTo("audit-owner@example.com")?.text ?? "",
    );

    // Owner accepts the invitation, fails once, signs in and out.
    const accepted = await t
      .http()
      .post("/auth/invitations/accept")
      .send({ token: ownerInvitation, password: PASSWORD, client: "mobile" });
    const ownerToken = SessionOutput.parse(accepted.body).token ?? "";
    const owner = { Authorization: `Bearer ${ownerToken}` };
    await t.http().post("/auth/login").send({
      email: "audit-owner@example.com",
      password: "wrong-guess-pass",
      client: "mobile",
    });
    const login = await t.http().post("/auth/login").send({
      email: "audit-owner@example.com",
      password: PASSWORD,
      client: "mobile",
    });
    const second = {
      Authorization: `Bearer ${SessionOutput.parse(login.body).token ?? ""}`,
    };
    await t.http().post("/auth/logout").set(second);

    // Owner invites a barber, who accepts, recovers the password and is then deactivated/reactivated.
    const invited = await t.http().post("/team/invitations").set(owner).send({
      name: "Audit Barber Person",
      email: "audit-barber@example.com",
      role: "barber",
    });
    const barberId = (invited.body as { user: { id: string } }).user.id;
    const barberInvitation = invitationTokenFrom(
      t.email.lastTo("audit-barber@example.com")?.text ?? "",
    );
    await t
      .http()
      .post("/auth/invitations/accept")
      .send({ token: barberInvitation, password: PASSWORD, client: "mobile" });
    await t
      .http()
      .post("/auth/password/forgot")
      .send({ email: "audit-barber@example.com" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const resetToken =
      /\/reset-password\/([A-Za-z0-9_-]+)/.exec(
        t.email.lastTo("audit-barber@example.com")?.text ?? "",
      )?.[1] ?? "";
    await t
      .http()
      .post("/auth/password/reset")
      .send({ token: resetToken, password: NEW_PASSWORD });
    await t.http().post(`/team/${barberId}/deactivate`).set(owner);
    await t.http().post(`/team/${barberId}/reactivate`).set(owner);
    await t.http().post(`/team/${barberId}/deactivate`).set(owner);
    await tools.anonymization.anonymize({ email: "audit-barber@example.com" });

    const events = await withTenantAdmin(barbershopId, (tx) =>
      tx.select().from(securityEvent),
    );

    expect([...new Set(events.map((e) => e.type))].sort()).toEqual(
      [...ALL_TYPES].sort(),
    );
    for (const event of events) {
      expect(event.occurredAt, event.type).toBeInstanceOf(Date);
      expect(event.actorType, event.type).toMatch(/^(user|platform|system)$/);
      if (event.actorType === "user") {
        expect(event.actorUserId, event.type).not.toBeNull();
      }
    }
    // Who did what: platform events have no user actor.
    expect(
      events
        .filter(
          (e) =>
            e.type === "barbershop_provisioned" || e.type === "user_anonymized",
        )
        .every((e) => e.actorType === "platform" && e.actorUserId === null),
    ).toBe(true);

    const text = JSON.stringify(events);
    for (const forbidden of [
      "audit-owner@example.com",
      "audit-barber@example.com",
      "Audit Owner Person",
      "Audit Barber Person",
      PASSWORD,
      NEW_PASSWORD,
      "wrong-guess-pass",
      ownerToken,
      resetToken,
      ownerInvitation,
      barberInvitation,
    ]) {
      expect(text, `the trail must not contain "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });
});
