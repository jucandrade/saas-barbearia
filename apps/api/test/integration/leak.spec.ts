import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeamOutput, MeOutput, SessionOutput } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { user } from "../../src/db/schema/index.js";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { withTenantAdmin, closeConnections } from "./helpers/db.js";
import {
  createBarbershop,
  createAccessToken,
  createUser,
} from "./helpers/factory.js";

/**
 * Leakage suite between barbershops (FR-018, FR-019, SC-003).
 *
 * Each row of ROUTES is an attempt by barbershop A to reach something of B through an
 * HTTP path. When adding an endpoint (team, recovery…), add its row here:
 * the goal is to cover EVERY existing access path.
 */

const ID_NONEXISTENT = "00000000-0000-4000-8000-000000000000";

interface Actor {
  tenantId: string;
  userId: string;
  barbershopName: string;
  userName: string;
  email: string;
  token: string;
  /** A still-invited barber, with their invitation token. */
  invitedId: string;
  invitedEmail: string;
  invitationTokenFrom: string;
}

interface Context {
  t: TestApp;
  a: Actor;
  b: Actor;
  password: string;
}

interface RouteCross {
  name: string;
  run: (ctx: Context) => Promise<void>;
}

/** No identifier, name or e-mail of the actor appears in the text. */
function withoutTraceOf(text: string, actor: Actor): void {
  for (const trace of [
    actor.tenantId,
    actor.userId,
    actor.barbershopName,
    actor.userName,
    actor.email,
    actor.invitedId,
    actor.invitedEmail,
    actor.invitationTokenFrom,
  ]) {
    expect(text).not.toContain(trace);
  }
}

export const ROUTES: RouteCross[] = [
  {
    name: "GET /auth/me as A brings nothing of B",
    async run({ t, a, b }) {
      const r = await t
        .http()
        .get("/auth/me")
        .set("Authorization", `Bearer ${a.token}`);
      expect(r.status).toBe(200);
      const eu = MeOutput.parse(r.body);
      expect(eu.user.barbershopId).toBe(a.tenantId);
      expect(eu.barbershop.id).toBe(a.tenantId);
      withoutTraceOf(JSON.stringify(r.body), b);
    },
  },
  {
    name: "GET /auth/invitations/{B's token} is the same for logged-in A and anonymous, and brings only its own invitation",
    async run({ t, a, b }) {
      const anonymous = await t
        .http()
        .get(`/auth/invitations/${b.invitationTokenFrom}`);
      const asA = await t
        .http()
        .get(`/auth/invitations/${b.invitationTokenFrom}`)
        .set("Authorization", `Bearer ${a.token}`);
      expect(asA.status).toBe(anonymous.status);
      expect(asA.body).toEqual(anonymous.body);
      expect(JSON.stringify(asA.body)).toContain(b.barbershopName);
      withoutTraceOf(JSON.stringify(asA.body), a);
    },
  },
  {
    name: "POST /auth/invitations/accept with B's token, logged in as A, only activates B's invitee",
    async run({ t, a, b, password }) {
      const r = await t
        .http()
        .post("/auth/invitations/accept")
        .set("Authorization", `Bearer ${a.token}`)
        .send({ token: b.invitationTokenFrom, password, client: "mobile" });
      expect(r.status).toBe(200);
      const session = SessionOutput.parse(r.body);
      expect(session.user.barbershopId).toBe(b.tenantId);
      withoutTraceOf(JSON.stringify(r.body), a);

      const doA = await withTenantAdmin(a.tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, a.invitedId)),
      );
      expect(doA[0]?.status).toBe("invited");
    },
  },
  {
    name: "POST /auth/login with B's e-mail and A's password answers the generic 401, with nothing of B",
    async run({ t, a, b }) {
      const r = await t
        .http()
        .post("/auth/login")
        .send({
          email: b.email,
          password: `${a.userName}-wrong`,
          client: "web",
        });
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ code: "INVALID_CREDENTIALS" });
      withoutTraceOf(JSON.stringify(r.body), b);
    },
  },
  {
    name: "POST /auth/logout by A does not end B's session",
    async run({ t, a, b }) {
      expect(
        (
          await t
            .http()
            .post("/auth/logout")
            .set("Authorization", `Bearer ${a.token}`)
        ).status,
      ).toBe(204);
      expect(
        (
          await t
            .http()
            .get("/auth/me")
            .set("Authorization", `Bearer ${a.token}`)
        ).status,
      ).toBe(401);
      const deB = await t
        .http()
        .get("/auth/me")
        .set("Authorization", `Bearer ${b.token}`);
      expect(deB.status).toBe(200);
      expect(MeOutput.parse(deB.body).barbershop.id).toBe(b.tenantId);
    },
  },
  {
    name: "GET /team as A lists only A's team",
    async run({ t, a, b }) {
      const r = await t
        .http()
        .get("/team")
        .set("Authorization", `Bearer ${a.token}`);
      expect(r.status).toBe(200);
      const { users } = TeamOutput.parse(r.body);
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((u) => u.barbershopId === a.tenantId)).toBe(true);
      withoutTraceOf(JSON.stringify(r.body), b);
    },
  },
  {
    name: "POST /team/{B's id}/deactivate as A answers the 404 of a nonexistent id and does not touch B",
    async run({ t, a, b }) {
      const deB = await t
        .http()
        .post(`/team/${b.userId}/deactivate`)
        .set("Authorization", `Bearer ${a.token}`);
      const nonexistent = await t
        .http()
        .post(`/team/${ID_NONEXISTENT}/deactivate`)
        .set("Authorization", `Bearer ${a.token}`);
      expect(deB.status).toBe(404);
      expect(deB.body).toEqual(nonexistent.body);
      expect(
        (
          await t
            .http()
            .get("/auth/me")
            .set("Authorization", `Bearer ${b.token}`)
        ).status,
      ).toBe(200);
    },
  },
  {
    name: "POST /team/{B's id}/reactivate as A answers 404",
    async run({ t, a, b }) {
      const r = await t
        .http()
        .post(`/team/${b.userId}/reactivate`)
        .set("Authorization", `Bearer ${a.token}`);
      expect(r.status).toBe(404);
      withoutTraceOf(JSON.stringify(r.body), b);
    },
  },
  {
    name: "POST /team/{B's id}/resend-invitation as A answers 404 and resends nothing",
    async run({ t, a, b }) {
      t.email.clear();
      const r = await t
        .http()
        .post(`/team/${b.invitedId}/resend-invitation`)
        .set("Authorization", `Bearer ${a.token}`);
      expect(r.status).toBe(404);
      expect(t.email.messages).toHaveLength(0);
      // B's original invitation remains valid.
      expect(
        (await t.http().get(`/auth/invitations/${b.invitationTokenFrom}`))
          .status,
      ).toBe(200);
    },
  },
  {
    name: "POST /team/invitations with B's e-mail answers the same 409 as an e-mail of A, without revealing B",
    async run({ t, a, b }) {
      const body = (email: string) => ({
        name: "Someone",
        email,
        role: "barber",
      });
      const deB = await t
        .http()
        .post("/team/invitations")
        .set("Authorization", `Bearer ${a.token}`)
        .send(body(b.email));
      const deA = await t
        .http()
        .post("/team/invitations")
        .set("Authorization", `Bearer ${a.token}`)
        .send(body(a.email));
      expect(deB.status).toBe(409);
      expect(deB.body).toEqual(deA.body);
      withoutTraceOf(JSON.stringify(deB.body), b);
    },
  },
];

describe("leakage between barbershops (HTTP)", () => {
  const password = "barber-chair-secret";
  let t: TestApp;
  let hash: string;
  let counter = 0;

  async function actor(name: string): Promise<Actor> {
    counter += 1;
    const suffix = String(counter);
    const barbershopName = `Barbearia ${name} ${suffix}`;
    const { barbershopId: tenantId } = await createBarbershop(barbershopName);
    const userName = `Dono ${name} ${suffix}`;
    const email = `owner-${name.toLowerCase()}-${suffix}@example.com`;
    const userId = await createUser({
      tenantId,
      name: userName,
      email,
      role: "owner",
      passwordHash: hash,
    });
    const invitedEmail = `invited-${name.toLowerCase()}-${suffix}@example.com`;
    const invitedId = await createUser({
      tenantId,
      name: `Convidado ${name} ${suffix}`,
      email: invitedEmail,
      role: "barber",
      status: "invited",
    });
    const invitationTokenFrom = await createAccessToken({
      tenantId,
      userId: invitedId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const token = await t.openSession({
      id: userId,
      tenantId,
      role: "owner",
    });
    return {
      tenantId,
      userId,
      barbershopName,
      userName,
      email,
      token,
      invitedId,
      invitedEmail,
      invitationTokenFrom,
    };
  }

  beforeAll(async () => {
    t = await createApp();
    hash = await t.app.get(PasswordService).hash(password);
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("the table covers the existing endpoints", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
  });

  // New barbershops and sessions for each route: routes change state (logout, invitation acceptance).
  it.each(ROUTES)("$name", async ({ run }) => {
    await run({ t, password, a: await actor("A"), b: await actor("B") });
  });
});
