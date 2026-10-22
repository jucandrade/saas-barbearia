import { ErrorBody, MeOutput, SessionOutput } from "@barbearia/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { securityEvent, accessToken, user } from "../../src/db/schema/index.js";
import { hashToken } from "../../src/identity/security/tokens.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { withTenantAdmin, closeConnections } from "./helpers/db.js";
import {
  createBarbershop,
  createAccessToken,
  createUser,
} from "./helpers/factory.js";

const DAY = 24 * 60 * 60 * 1000;
const INVALID_MESSAGE =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";
const INVALID_INVITATION = {
  code: "INVALID_INVITATION",
  message: INVALID_MESSAGE,
};

describe("invitations and GET /auth/me", () => {
  let t: TestApp;
  let counter = 0;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function newInvitation(
    options: {
      expiresAt?: Date;
      usedAt?: Date;
      invalidatedAt?: Date;
      barbershopName?: string;
      status?: "invited" | "active";
    } = {},
  ) {
    counter += 1;
    const { barbershopId: tenantId } = await createBarbershop(
      options.barbershopName ?? `Convites ${String(counter)}`,
    );
    const email = `owner-inv-${String(counter)}@example.com`;
    const userId = await createUser({
      tenantId,
      email,
      name: "Ana Souza",
      role: "owner",
      status: options.status ?? "invited",
    });
    const token = await createAccessToken({
      tenantId,
      userId,
      expiresAt:
        options.expiresAt ?? new Date(t.clock.now().getTime() + 7 * DAY),
      usedAt: options.usedAt ?? null,
      invalidatedAt: options.invalidatedAt ?? null,
    });
    return { tenantId, userId, email, token };
  }

  describe("GET /auth/invitations/{token}", () => {
    it("returns the invitee's name and the barbershop", async () => {
      const c = await newInvitation({
        barbershopName: "Invitation Barbershop",
      });
      const r = await t.http().get(`/auth/invitations/${c.token}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        name: "Ana Souza",
        barbershop: "Invitation Barbershop",
      });
    });

    it.each([
      ["nonexistent", () => Promise.resolve("token-that-does-not-exist")],
      ["used", async () => (await newInvitation({ usedAt: new Date() })).token],
      [
        "invalidated",
        async () => (await newInvitation({ invalidatedAt: new Date() })).token,
      ],
      [
        "expired",
        async () =>
          (
            await newInvitation({
              expiresAt: new Date(t.clock.now().getTime() - 1000),
            })
          ).token,
      ],
    ])("invitation %s answers the same 410", async (_name, get) => {
      const r = await t.http().get(`/auth/invitations/${await get()}`);
      expect(r.status).toBe(410);
      expect(r.body).toEqual(INVALID_INVITATION);
    });
  });

  describe("POST /auth/invitations/accept", () => {
    it("web: activates the user, uses the token, sets the cookie and does not return the token in the body", async () => {
      const c = await newInvitation();
      const r = await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "barber-chair-secret",
        client: "web",
      });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        user: {
          id: c.userId,
          name: "Ana Souza",
          email: c.email,
          role: "owner",
          status: "active",
          barbershopId: c.tenantId,
        },
      });
      const cookie =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(cookie).toMatch(/^session=[A-Za-z0-9_%-]+;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");

      const state = await withTenantAdmin(c.tenantId, async (tx) => ({
        users: await tx.select().from(user),
        tokens: await tx.select().from(accessToken),
        events: await tx.select().from(securityEvent),
      }));
      expect(state.users[0]).toMatchObject({ status: "active" });
      expect(state.users[0]?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(state.tokens[0]?.usedAt).toBeInstanceOf(Date);
      expect(state.events).toMatchObject([
        {
          type: "invitation_accepted",
          actorType: "user",
          actorUserId: c.userId,
        },
      ]);
    });

    it("mobile: returns the token in the body and sets no cookie; Bearer works", async () => {
      const c = await newInvitation();
      const r = await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "barber-chair-secret",
        client: "mobile",
      });
      expect(r.status).toBe(200);
      expect(r.headers["set-cookie"]).toBeUndefined();
      const session = SessionOutput.parse(r.body);
      expect(typeof session.token).toBe("string");
      const eu = await t
        .http()
        .get("/auth/me")
        .set("Authorization", `Bearer ${session.token ?? ""}`);
      expect(eu.status).toBe(200);
      expect(MeOutput.parse(eu.body).user.id).toBe(c.userId);
    });

    it("a weak password answers 400 WEAK_PASSWORD with the reason and does not consume the invitation", async () => {
      const c = await newInvitation();
      const short = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ token: c.token, password: "abc123", client: "web" });
      expect(short.status).toBe(400);
      const shortError = ErrorBody.parse(short.body);
      expect(shortError.code).toBe("WEAK_PASSWORD");
      expect(shortError.fields?.password).toContain("8 caracteres");

      const common = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ token: c.token, password: "password123", client: "web" });
      expect(ErrorBody.parse(common.body).fields?.password).toMatch(/comum/);

      const equalEmail = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ token: c.token, password: c.email, client: "web" });
      expect(ErrorBody.parse(equalEmail.body).fields?.password).toMatch(
        /e-mail/,
      );

      const equalName = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ token: c.token, password: "ana souza", client: "web" });
      expect(ErrorBody.parse(equalName.body).fields?.password).toMatch(/nome/);

      const ok = await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "barber-chair-secret",
        client: "web",
      });
      expect(ok.status).toBe(200);
    });

    it("reusing the token answers 410", async () => {
      const c = await newInvitation();
      await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "barber-chair-secret",
        client: "web",
      });
      const again = await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "other-password-good",
        client: "web",
      });
      expect(again.status).toBe(410);
      expect(again.body).toEqual(INVALID_INVITATION);
    });

    it("an invitation expired by the clock answers 410", async () => {
      const c = await newInvitation();
      t.clock.advance(8 * DAY);
      const r = await t.http().post("/auth/invitations/accept").send({
        token: c.token,
        password: "barber-chair-secret",
        client: "web",
      });
      expect(r.status).toBe(410);
      t.clock.advance(-8 * DAY);
    });

    it("two simultaneous acceptances of the same invitation: only one counts", async () => {
      const c = await newInvitation();
      const body = {
        token: c.token,
        password: "barber-chair-secret",
        client: "web",
      };
      const [a, b] = await Promise.all([
        t.http().post("/auth/invitations/accept").send(body),
        t.http().post("/auth/invitations/accept").send(body),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 410]);
    });

    it("invalid data answers 400 INVALID_DATA with the fields", async () => {
      const r = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ password: "x" });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        code: "INVALID_DATA",
        fields: { token: "Campo obrigatório.", client: "Campo obrigatório." },
      });
    });

    it("stores only the invitation token hash in the database", async () => {
      const c = await newInvitation();
      const tokens = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(accessToken),
      );
      expect(tokens[0]?.tokenHash.equals(hashToken(c.token))).toBe(true);
    });
  });

  describe("GET /auth/me", () => {
    it("without a session answers 401", async () => {
      expect((await t.http().get("/auth/me")).status).toBe(401);
    });

    it("returns only its own barbershop, with the initial unit and time zone", async () => {
      const a = await newInvitation({
        barbershopName: "Barbearia EU A",
        status: "active",
      });
      const b = await newInvitation({
        barbershopName: "Barbearia EU B",
        status: "active",
      });
      const tokenA = await t.openSession({
        id: a.userId,
        tenantId: a.tenantId,
        role: "owner",
      });
      const r = await t
        .http()
        .get("/auth/me")
        .set("Authorization", `Bearer ${tokenA}`);
      expect(r.status).toBe(200);
      const eu = MeOutput.parse(r.body);
      expect(eu.user).toMatchObject({
        id: a.userId,
        barbershopId: a.tenantId,
        role: "owner",
      });
      expect(eu.barbershop).toMatchObject({
        id: a.tenantId,
        name: "Barbearia EU A",
      });
      expect(eu.barbershop.units).toHaveLength(1);
      expect(eu.barbershop.units[0]).toMatchObject({
        name: "Main",
        timezone: "America/Sao_Paulo",
      });
      expect(JSON.stringify(r.body)).not.toContain(b.tenantId);
      expect(JSON.stringify(r.body)).not.toContain("password");
    });
  });
});
