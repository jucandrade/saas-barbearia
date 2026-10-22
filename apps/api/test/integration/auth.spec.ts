import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ErrorBody, MeOutput, SessionOutput } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { securityEvent, user } from "../../src/db/schema/index.js";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { createApp, ADMIN_ORIGIN, type TestApp } from "./helpers/app.js";
import {
  withTenantAdmin,
  superConnection,
  closeConnections,
} from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

const PASSWORD = "barber-chair-secret";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MINUTE = 60 * 1000;
const INVALID_CREDENTIALS = {
  code: "INVALID_CREDENTIALS",
  message: "E-mail ou senha incorretos, ou acesso temporariamente bloqueado.",
};

describe("POST /auth/login e /auth/logout", () => {
  let t: TestApp;
  let hash: string;
  let counter = 0;

  beforeAll(async () => {
    t = await createApp();
    hash = await t.app.get(PasswordService).hash(PASSWORD);
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function account(
    options: {
      role?: "owner" | "barber";
      status?: "invited" | "active" | "deactivated";
    } = {},
  ) {
    counter += 1;
    const { barbershopId: tenantId } = await createBarbershop(
      `Auth ${String(counter)}`,
    );
    const status = options.status ?? "active";
    const email = `account-auth-${String(counter)}@example.com`;
    const id = await createUser({
      tenantId,
      email,
      name: "Ana Souza",
      role: options.role ?? "barber",
      status,
      passwordHash: status === "invited" ? null : hash,
    });
    return { id, tenantId, email };
  }

  const signIn = (
    email: string,
    password: string,
    client: "web" | "mobile" = "web",
  ) => t.http().post("/auth/login").send({ email, password, client });

  const stateInDatabase = async (c: { id: string; tenantId: string }) => {
    const [u] = await withTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(user).where(eq(user.id, c.id)),
    );
    return u;
  };

  describe("successful login", () => {
    it("web: sets the HttpOnly cookie and does not return the token in the body", async () => {
      const c = await account({ role: "owner" });
      const r = await signIn(c.email, PASSWORD, "web");
      expect(r.status).toBe(200);
      const session = SessionOutput.parse(r.body);
      expect(session.token).toBeUndefined();
      expect(session.user).toMatchObject({
        id: c.id,
        role: "owner",
        status: "active",
        barbershopId: c.tenantId,
      });
      const cookie =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(cookie).toMatch(/^session=[A-Za-z0-9_%-]+;/);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");

      const eu = await t
        .http()
        .get("/auth/me")
        .set("Cookie", cookie.split(";")[0] ?? "");
      expect(MeOutput.parse(eu.body).user.id).toBe(c.id);
    });

    it("mobile: returns the token in the body and sets no cookie; Bearer works", async () => {
      const c = await account();
      const r = await signIn(c.email, PASSWORD, "mobile");
      expect(r.status).toBe(200);
      expect(r.headers["set-cookie"]).toBeUndefined();
      const session = SessionOutput.parse(r.body);
      const eu = await t
        .http()
        .get("/auth/me")
        .set("Authorization", `Bearer ${session.token ?? ""}`);
      expect(eu.status).toBe(200);
    });

    it("accepts the e-mail with uppercase and spaces", async () => {
      const c = await account();
      expect(
        (await signIn(`  ${c.email.toUpperCase()} `, PASSWORD)).status,
      ).toBe(200);
    });

    it("malformed data answers 400 INVALID_DATA, revealing nothing about the account", async () => {
      const r = await t
        .http()
        .post("/auth/login")
        .send({ email: "nao-e-email", password: "x", client: "web" });
      expect(r.status).toBe(400);
      expect(ErrorBody.parse(r.body).code).toBe("INVALID_DATA");
    });
  });

  describe("logout", () => {
    it("revokes the session: the same token now gets 401", async () => {
      const c = await account();
      const { token } = SessionOutput.parse(
        (await signIn(c.email, PASSWORD, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(200);
      expect((await t.http().post("/auth/logout").set(auth)).status).toBe(204);
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(401);
    });

    it("web: clears the cookie and requires the admin origin", async () => {
      const c = await account();
      const login = await signIn(c.email, PASSWORD, "web");
      const cookie =
        ((login.headers["set-cookie"] as unknown as string[])[0] ?? "").split(
          ";",
        )[0] ?? "";

      expect(
        (await t.http().post("/auth/logout").set("Cookie", cookie)).status,
      ).toBe(403);
      const r = await t
        .http()
        .post("/auth/logout")
        .set("Cookie", cookie)
        .set("Origin", ADMIN_ORIGIN);
      expect(r.status).toBe(204);
      const clean =
        (r.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? "";
      expect(clean).toContain("session=;");
      expect(clean).toContain("Max-Age=0");
      expect(
        (await t.http().get("/auth/me").set("Cookie", cookie)).status,
      ).toBe(401);
    });

    it("without a session answers 401", async () => {
      expect((await t.http().post("/auth/logout")).status).toBe(401);
    });
  });

  describe("indistinguishable failures (FR-014, SC-005)", () => {
    it("unknown e-mail, wrong password, invited, deactivated and locked all answer the same 401", async () => {
      const active = await account();
      const invited = await account({ status: "invited" });
      const deactivated = await account({ status: "deactivated" });
      const locked = await account();
      for (let i = 0; i < 5; i += 1) {
        await signIn(locked.email, "password-wrong");
      }

      const responses = [
        await signIn("nobody-auth@example.com", PASSWORD),
        await signIn(active.email, "password-wrong"),
        await signIn(invited.email, PASSWORD),
        await signIn(deactivated.email, PASSWORD),
        await signIn(locked.email, PASSWORD), // CORRECT password, but the account is locked
      ];
      for (const r of responses) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual(INVALID_CREDENTIALS);
        expect(r.headers["set-cookie"]).toBeUndefined();
      }
    });

    it("an unknown e-mail also spends the time of a password verification", async () => {
      const spy = vi.spyOn(t.app.get(PasswordService), "verifyDummyPassword");
      await signIn("never-existed@example.com", PASSWORD);
      expect(spy).toHaveBeenCalledOnce();
      spy.mockRestore();
    });
  });

  describe("per-account lockout (FR-015)", () => {
    it("the 5th consecutive failure locks for 15 minutes; then it releases and success resets the counter", async () => {
      const c = await account();
      for (let i = 0; i < 4; i += 1) {
        await signIn(c.email, "not-the-password");
      }
      expect((await stateInDatabase(c))?.failedAttempts).toBe(4);
      await signIn(c.email, "not-the-password");
      const locked = await stateInDatabase(c);
      expect(locked?.failedAttempts).toBe(5);
      expect(locked?.lockedUntil).toEqual(
        new Date(t.clock.now().getTime() + 15 * MINUTE),
      );

      t.clock.advance(14 * MINUTE);
      expect((await signIn(c.email, PASSWORD)).status).toBe(401);
      t.clock.advance(2 * MINUTE);
      expect((await signIn(c.email, PASSWORD)).status).toBe(200);
      const free = await stateInDatabase(c);
      expect(free?.failedAttempts).toBe(0);
      expect(free?.lockedUntil).toBeNull();
    });

    it("a valid login in between resets the earlier failures", async () => {
      const c = await account();
      await signIn(c.email, "not-the-password");
      await signIn(c.email, "not-the-password");
      expect((await signIn(c.email, PASSWORD)).status).toBe(200);
      expect((await stateInDatabase(c))?.failedAttempts).toBe(0);
    });

    it("attempts during the lockout do not extend it", async () => {
      const c = await account();
      for (let i = 0; i < 5; i += 1) {
        await signIn(c.email, "not-the-password");
      }
      const before = (await stateInDatabase(c))?.lockedUntil;
      t.clock.advance(5 * MINUTE);
      await signIn(c.email, "not-the-password");
      expect((await stateInDatabase(c))?.lockedUntil).toEqual(before);
      t.clock.advance(-5 * MINUTE);
    });

    it("simultaneous attempts do not bypass the counter (the account is locked during verification)", async () => {
      const c = await account();
      await Promise.all(
        Array.from({ length: 8 }, () => signIn(c.email, "not-the-password")),
      );
      const u = await stateInDatabase(c);
      expect(u?.failedAttempts).toBe(5);
      expect(u?.lockedUntil).not.toBeNull();
    });
  });

  describe("session expiration by role (FR-013)", () => {
    it("owner: 12 hours of inactivity", async () => {
      const c = await account({ role: "owner" });
      const { token } = SessionOutput.parse(
        (await signIn(c.email, PASSWORD, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      t.clock.advance(12 * HOUR - MINUTE);
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(200);
      t.clock.advance(12 * HOUR + MINUTE);
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(401);
    });

    it("barber: 30 days of inactivity", async () => {
      const c = await account({ role: "barber" });
      const { token } = SessionOutput.parse(
        (await signIn(c.email, PASSWORD, "mobile")).body,
      );
      const auth = { Authorization: `Bearer ${token ?? ""}` };
      t.clock.advance(29 * DAY);
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(200);
      t.clock.advance(31 * DAY);
      expect((await t.http().get("/auth/me").set(auth)).status).toBe(401);
    });
  });

  describe("audit trail (FR-020)", () => {
    it("records login_success, login_failure and logout without e-mail, name, password, token or IP", async () => {
      const c = await account();
      await signIn(c.email, "not-the-password");
      const login = await signIn(c.email, PASSWORD, "mobile");
      const { token } = SessionOutput.parse(login.body);
      await t
        .http()
        .post("/auth/logout")
        .set("Authorization", `Bearer ${token ?? ""}`);

      const events = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(securityEvent),
      );
      expect(events.map((e) => e.type).sort()).toEqual([
        "login_failure",
        "login_success",
        "logout",
      ]);
      expect(
        events.every((e) => e.actorUserId === c.id && e.actorType === "user"),
      ).toBe(true);
      const text = JSON.stringify(events);
      for (const forbidden of [
        c.email,
        "Ana Souza",
        PASSWORD,
        "not-the-password",
        token ?? "x",
        "127.0.0.1",
        "::1",
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });

    it("a failure for an unknown e-mail becomes an event without a barbershop, invisible to any tenant", async () => {
      const before = await superConnection().query<{ n: number }>(
        "select count(*)::int as n from security_events where tenant_id is null and type = 'login_failure'",
      );
      await signIn("ghost-auth@example.com", PASSWORD);
      const after = await superConnection().query<{ n: number }>(
        "select count(*)::int as n from security_events where tenant_id is null and type = 'login_failure'",
      );
      expect((after.rows[0]?.n ?? 0) - (before.rows[0]?.n ?? 0)).toBe(1);
    });
  });
});

describe("per-origin limit (FR-015)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp({ limitPerMinute: 3 });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("above 3 attempts per minute from the same IP, login answers 429 with Retry-After", async () => {
    const attempt = () =>
      t
        .http()
        .post("/auth/login")
        .send({ email: "x@example.com", password: "y", client: "web" });
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const r = await attempt();
    expect(r.status).toBe(429);
    expect(ErrorBody.parse(r.body).code).toBe("TOO_MANY_REQUESTS");
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("the limit does not apply to protected routes", async () => {
    const { barbershopId: tenantId } = await createBarbershop("No limit");
    const id = await createUser({ tenantId, role: "owner" });
    const token = await t.openSession({ id, tenantId, role: "owner" });
    for (let i = 0; i < 6; i += 1) {
      expect(
        (await t.http().get("/auth/me").set("Authorization", `Bearer ${token}`))
          .status,
      ).toBe(200);
    }
  });
});
