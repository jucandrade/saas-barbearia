import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ForgotOutput,
  ErrorBody,
  RECOVERY_MESSAGE,
  SessionOutput,
} from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { securityEvent, accessToken, user } from "../../src/db/schema/index.js";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { withTenantAdmin, closeConnections } from "./helpers/db.js";
import {
  createBarbershop,
  createAccessToken,
  createUser,
} from "./helpers/factory.js";

const PASSWORD = "barber-chair-secret";
const NEW_PASSWORD = "scissors-well-sharp-7";
const HOUR = 60 * 60 * 1000;
const INVALID_TOKEN = {
  code: "INVALID_TOKEN",
  message: "Este link não é mais válido. Peça uma nova redefinição de senha.",
};

/** Extracts the token from the `…/reset-password/<token>` link of the e-mail. */
function tokenDoEmail(text: string): string {
  const match = /\/reset-password\/([A-Za-z0-9_-]+)/.exec(text);
  if (match?.[1] === undefined) {
    throw new Error("the e-mail has no reset link");
  }
  return match[1];
}

describe("password recovery", () => {
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
    status: "active" | "invited" | "deactivated" = "active",
  ) {
    counter += 1;
    const { barbershopId: tenantId } = await createBarbershop(
      `Recupera ${String(counter)}`,
    );
    const email = `recovers-${String(counter)}@example.com`;
    const id = await createUser({
      tenantId,
      email,
      name: "Ana Souza",
      role: "barber",
      status,
      passwordHash: status === "invited" ? null : hash,
    });
    return { tenantId, id, email };
  }

  const forgot = (email: string) =>
    t.http().post("/auth/password/forgot").send({ email });
  const reset = (token: string, password: string) =>
    t.http().post("/auth/password/reset").send({ token, password });
  const signIn = (email: string, password: string) =>
    t.http().post("/auth/login").send({ email, password, client: "mobile" });

  /** Gives time to the asynchronous e-mail sending (the response does not await it). */
  const awaitSending = () => new Promise((resolve) => setTimeout(resolve, 30));

  describe("POST /auth/password/forgot", () => {
    it("answers 202 with the same message whether or not the account exists", async () => {
      const c = await account();
      const existing = await forgot(c.email);
      const nonexistent = await forgot("nobody-recovers@example.com");
      expect(existing.status).toBe(202);
      expect(nonexistent.status).toBe(202);
      expect(existing.body).toEqual(nonexistent.body);
      expect(ForgotOutput.parse(existing.body).message).toBe(RECOVERY_MESSAGE);
    });

    it("only sends e-mail to an active account", async () => {
      const active = await account("active");
      const invited = await account("invited");
      const deactivated = await account("deactivated");
      t.email.clear();
      for (const c of [active, invited, deactivated]) {
        await forgot(c.email);
      }
      await forgot("ghost-recovers@example.com");
      await awaitSending();

      const message = t.email.lastTo(active.email);
      expect(message?.text).toContain("/reset-password/");
      expect(message?.text).toContain("1 hora");
      expect(t.email.lastTo(invited.email)).toBeUndefined();
      expect(t.email.lastTo(deactivated.email)).toBeUndefined();
      expect(t.email.lastTo("ghost-recovers@example.com")).toBeUndefined();
      expect(t.email.messages).toHaveLength(1);
    });

    it("asking again invalidates the previous link", async () => {
      const c = await account();
      await forgot(c.email);
      await awaitSending();
      const first = tokenDoEmail(t.email.lastTo(c.email)?.text ?? "");
      await forgot(c.email);
      await awaitSending();
      const second = tokenDoEmail(t.email.lastTo(c.email)?.text ?? "");
      expect(second).not.toBe(first);

      expect((await reset(first, NEW_PASSWORD)).status).toBe(410);
      expect((await reset(second, NEW_PASSWORD)).status).toBe(204);
    });

    it("records password_recovery_requested without e-mail, name or token", async () => {
      const c = await account();
      await forgot(c.email);
      await awaitSending();
      const events = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(securityEvent),
      );
      expect(
        events.filter((e) => e.type === "password_recovery_requested"),
      ).toHaveLength(1);
      const token = tokenDoEmail(t.email.lastTo(c.email)?.text ?? "");
      const text = JSON.stringify(events);
      for (const forbidden of [c.email, "Ana Souza", token]) {
        expect(text).not.toContain(forbidden);
      }
    });

    it("the stored token is valid for 1 hour and only the hash stays in the database", async () => {
      const c = await account();
      await forgot(c.email);
      await awaitSending();
      const token = tokenDoEmail(t.email.lastTo(c.email)?.text ?? "");
      const rows = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(accessToken),
      );
      const stored = rows.find((l) => l.purpose === "recovery");
      expect(stored?.expiresAt).toEqual(
        new Date(t.clock.now().getTime() + HOUR),
      );
      expect(stored?.tokenHash.toString("base64url")).not.toBe(token);
    });

    it("if e-mail sending fails, the response stays the same", async () => {
      const c = await account();
      t.email.failNext = true;
      const r = await forgot(c.email);
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ message: RECOVERY_MESSAGE });
    });

    it("a malformed e-mail answers 400 INVALID_DATA", async () => {
      const r = await forgot("nao-e-email");
      expect(r.status).toBe(400);
      expect(ErrorBody.parse(r.body).code).toBe("INVALID_DATA");
    });
  });

  describe("POST /auth/password/reset", () => {
    async function request(c: { email: string }) {
      await forgot(c.email);
      await awaitSending();
      return tokenDoEmail(t.email.lastTo(c.email)?.text ?? "");
    }

    it("changes the password: the old one stops working and the new one signs in", async () => {
      const c = await account();
      const token = await request(c);
      expect((await reset(token, NEW_PASSWORD)).status).toBe(204);
      expect((await signIn(c.email, PASSWORD)).status).toBe(401);
      expect((await signIn(c.email, NEW_PASSWORD)).status).toBe(200);
    });

    it("does not start a session: the user must sign in afterwards", async () => {
      const c = await account();
      const token = await request(c);
      const r = await reset(token, NEW_PASSWORD);
      expect(r.status).toBe(204);
      expect(r.headers["set-cookie"]).toBeUndefined();
      expect(r.text).toBe("");
    });

    it("revokes all of the user's open sessions", async () => {
      const c = await account();
      const open =
        SessionOutput.parse((await signIn(c.email, PASSWORD)).body).token ?? "";
      expect(
        (await t.http().get("/auth/me").set("Authorization", `Bearer ${open}`))
          .status,
      ).toBe(200);
      const token = await request(c);
      await reset(token, NEW_PASSWORD);
      expect(
        (await t.http().get("/auth/me").set("Authorization", `Bearer ${open}`))
          .status,
      ).toBe(401);
    });

    it("resets the login failures and the lockout", async () => {
      const c = await account();
      for (let i = 0; i < 5; i += 1) {
        await signIn(c.email, "wrong");
      }
      expect((await signIn(c.email, PASSWORD)).status).toBe(401); // bloqueada
      const token = await request(c);
      await reset(token, NEW_PASSWORD);
      const [u] = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, c.id)),
      );
      expect(u).toMatchObject({ failedAttempts: 0, lockedUntil: null });
      expect((await signIn(c.email, NEW_PASSWORD)).status).toBe(200);
    });

    it("marks the token as used and records password_reset", async () => {
      const c = await account();
      const token = await request(c);
      await reset(token, NEW_PASSWORD);
      const rows = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(accessToken),
      );
      expect(rows.find((l) => l.purpose === "recovery")?.usedAt).toBeInstanceOf(
        Date,
      );
      const events = await withTenantAdmin(c.tenantId, (tx) =>
        tx.select().from(securityEvent),
      );
      expect(events.filter((e) => e.type === "password_reset")).toMatchObject([
        { actorType: "user", actorUserId: c.id, targetUserId: c.id },
      ]);
      expect(JSON.stringify(events)).not.toContain(NEW_PASSWORD);
    });

    it("reusing the link answers 410 INVALID_TOKEN", async () => {
      const c = await account();
      const token = await request(c);
      await reset(token, NEW_PASSWORD);
      const r = await reset(token, "other-password-good-9");
      expect(r.status).toBe(410);
      expect(r.body).toEqual(INVALID_TOKEN);
    });

    it("a link older than 1 hour answers 410", async () => {
      const c = await account();
      const token = await request(c);
      t.clock.advance(HOUR + 1000);
      expect((await reset(token, NEW_PASSWORD)).status).toBe(410);
      t.clock.advance(-(HOUR + 1000));
    });

    it("an unknown token or one of another purpose answers the same 410", async () => {
      const c = await account();
      const invitation = await createAccessToken({
        tenantId: c.tenantId,
        userId: c.id,
        purpose: "invitation",
        expiresAt: new Date(t.clock.now().getTime() + HOUR),
      });
      for (const token of ["token-that-does-not-exist", invitation]) {
        const r = await reset(token, NEW_PASSWORD);
        expect(r.status).toBe(410);
        expect(r.body).toEqual(INVALID_TOKEN);
      }
    });

    it("a weak password answers 400 WEAK_PASSWORD and the link stays valid", async () => {
      const c = await account();
      const token = await request(c);
      const weak = await reset(token, "12345678");
      expect(weak.status).toBe(400);
      const error = ErrorBody.parse(weak.body);
      expect(error.code).toBe("WEAK_PASSWORD");
      expect(error.fields?.password).toBeDefined();
      expect((await reset(token, c.email)).status).toBe(400);
      expect((await reset(token, NEW_PASSWORD)).status).toBe(204);
    });

    it("a user deactivated after asking for the link cannot use it", async () => {
      const c = await account();
      const token = await request(c);
      await withTenantAdmin(c.tenantId, (tx) =>
        tx.update(user).set({ status: "deactivated" }).where(eq(user.id, c.id)),
      );
      expect((await reset(token, NEW_PASSWORD)).status).toBe(410);
    });

    it("two simultaneous resets with the same link: only one counts", async () => {
      const c = await account();
      const token = await request(c);
      const [a, b] = await Promise.all([
        reset(token, NEW_PASSWORD),
        reset(token, "other-password-good-9"),
      ]);
      expect([a.status, b.status].sort()).toEqual([204, 410]);
    });
  });

  describe("response time (FR-014)", () => {
    let slow: TestApp;

    beforeAll(async () => {
      slow = await createApp({ recoveryFloorMs: 200 });
    });

    afterAll(async () => {
      await slow.close();
    });

    it("existing and missing accounts take at least the floor and almost the same time", async () => {
      const c = await account();
      const measure = async (email: string) => {
        const start = performance.now();
        await slow.http().post("/auth/password/forgot").send({ email });
        return performance.now() - start;
      };
      const existing = await measure(c.email);
      const nonexistent = await measure("vanished-recovers@example.com");
      expect(existing).toBeGreaterThanOrEqual(190);
      expect(nonexistent).toBeGreaterThanOrEqual(190);
      expect(Math.abs(existing - nonexistent)).toBeLessThan(150);
    });
  });
});

describe("per-origin limit on recovery", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp({ limitPerMinute: 2 });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("forgot and reset answer 429 above the limit", async () => {
    const forgot = () =>
      t.http().post("/auth/password/forgot").send({ email: "x@example.com" });
    expect((await forgot()).status).toBe(202);
    expect((await forgot()).status).toBe(202);
    const r = await forgot();
    expect(r.status).toBe(429);
    expect(ErrorBody.parse(r.body).code).toBe("TOO_MANY_REQUESTS");

    const reset = () =>
      t
        .http()
        .post("/auth/password/reset")
        .send({ token: "x", password: "barber-chair-secret" });
    expect((await reset()).status).toBe(410);
    expect((await reset()).status).toBe(410);
    expect((await reset()).status).toBe(429);
  });
});
