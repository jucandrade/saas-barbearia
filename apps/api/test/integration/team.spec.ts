import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InviteOutput,
  TeamOutput,
  ErrorBody,
  ResendOutput,
  SessionOutput,
} from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { securityEvent, user } from "../../src/db/schema/index.js";
import { PasswordService } from "../../src/identity/security/password.service.js";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  withTenantAdmin,
  adminConnection,
  closeConnections,
} from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";
import { invitationTokenFrom } from "./helpers/platform.js";

const PASSWORD = "barber-chair-secret";
const ID_NONEXISTENT = "00000000-0000-4000-8000-000000000000";

describe("team (owner role)", () => {
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

  interface Account {
    id: string;
    email: string;
    auth: { Authorization: string };
  }

  /** Creates an active account that already has an open session. */
  async function account(
    tenantId: string,
    role: "owner" | "barber",
    name = "Pessoa Teste",
  ): Promise<Account> {
    counter += 1;
    const email = `team-${String(counter)}@example.com`;
    const id = await createUser({
      tenantId,
      name,
      email,
      role,
      status: "active",
      passwordHash: hash,
    });
    const token = await t.openSession({ id, tenantId, role });
    return { id, email, auth: { Authorization: `Bearer ${token}` } };
  }

  async function barbershop(name: string) {
    const { barbershopId: tenantId } = await createBarbershop(
      `${name} ${String(counter + 1)}`,
    );
    const owner = await account(tenantId, "owner", "Dona Ana");
    const barber = await account(tenantId, "barber", "Bia Barbeira");
    return { tenantId, owner, barber };
  }

  const eventsOf = (tenantId: string) =>
    withTenantAdmin(tenantId, (tx) => tx.select().from(securityEvent));

  describe("permission", () => {
    it("a barber gets 403 NO_PERMISSION on every team route", async () => {
      const { barber, owner } = await barbershop("Permission");
      const routes = [
        () => t.http().get("/team"),
        () =>
          t
            .http()
            .post("/team/invitations")
            .send({ name: "X", email: "x@example.com", role: "barber" }),
        () => t.http().post(`/team/${owner.id}/resend-invitation`),
        () => t.http().post(`/team/${owner.id}/deactivate`),
        () => t.http().post(`/team/${owner.id}/reactivate`),
      ];
      for (const create of routes) {
        const r = await create().set(barber.auth);
        expect(r.status).toBe(403);
        expect(ErrorBody.parse(r.body).code).toBe("NO_PERMISSION");
      }
    });

    it("without a session answers 401", async () => {
      expect((await t.http().get("/team")).status).toBe(401);
    });
  });

  describe("GET /team", () => {
    it("lists only its own barbershop, ordered by name, without anonymized users", async () => {
      const a = await barbershop("Lista A");
      const b = await barbershop("Lista B");
      await withTenantAdmin(a.tenantId, (tx) =>
        tx.insert(user).values({
          tenantId: a.tenantId,
          name: "Usuário anonimizado",
          email: `anon-${String(counter)}@invalid`,
          role: "barber",
          status: "anonymized",
          anonymizedAt: new Date(),
        }),
      );
      const r = await t.http().get("/team").set(a.owner.auth);
      expect(r.status).toBe(200);
      const { users } = TeamOutput.parse(r.body);
      expect(users.map((u) => u.id).sort()).toEqual(
        [a.owner.id, a.barber.id].sort(),
      );
      expect(users.map((u) => u.name)).toEqual(["Bia Barbeira", "Dona Ana"]);
      expect(JSON.stringify(r.body)).not.toContain(b.owner.id);
      expect(JSON.stringify(r.body)).not.toContain("password");
    });
  });

  describe("POST /team/invitations", () => {
    it("invites a barber: creates as invited, sends the e-mail and records the event", async () => {
      const { tenantId, owner } = await barbershop("Invites");
      const r = await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Caio Corte",
        email: "  Caio.Team@Example.com ",
        role: "barber",
      });
      expect(r.status).toBe(201);
      const output = InviteOutput.parse(r.body);
      expect(output.invitationSent).toBe(true);
      expect(output.user).toMatchObject({
        name: "Caio Corte",
        email: "caio.team@example.com",
        role: "barber",
        status: "invited",
        barbershopId: tenantId,
      });

      const message = t.email.lastTo("caio.team@example.com");
      expect(message?.text).toContain("/invitation/");

      const events = (await eventsOf(tenantId)).filter(
        (e) => e.type === "invitation_sent",
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorUserId: owner.id,
        targetUserId: output.user.id,
        actorType: "user",
      });
      expect(JSON.stringify(events)).not.toContain("caio.team@example.com");
    });

    it("the invitee accepts the invitation and can sign in", async () => {
      const { owner } = await barbershop("Accepts");
      await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Dani",
        email: "dani-team@example.com",
        role: "barber",
      });
      const token = invitationTokenFrom(
        t.email.lastTo("dani-team@example.com")?.text ?? "",
      );
      const acceptance = await t
        .http()
        .post("/auth/invitations/accept")
        .send({ token, password: PASSWORD, client: "mobile" });
      expect(acceptance.status).toBe(200);
      expect(SessionOutput.parse(acceptance.body).user.role).toBe("barber");
    });

    it("an owner can invite another owner; the role is set on the invitation and does not change later", async () => {
      const { tenantId, owner } = await barbershop("Partner");
      const r = await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Partner Owner",
        email: "partner-team@example.com",
        role: "owner",
      });
      expect(r.status).toBe(201);
      const id = InviteOutput.parse(r.body).user.id;
      expect(InviteOutput.parse(r.body).user.role).toBe("owner");

      await expect(
        withTenantAdmin(tenantId, (tx) =>
          tx.update(user).set({ role: "barber" }).where(eq(user.id, id)),
        ),
      ).rejects.toThrow();
      const [after] = await withTenantAdmin(tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, id)),
      );
      expect(after?.role).toBe("owner");
    });

    it("an e-mail already used in ANY barbershop answers the same 409 EMAIL_UNAVAILABLE", async () => {
      const a = await barbershop("Duplicado A");
      const b = await barbershop("Duplicado B");
      const inOwn = await t
        .http()
        .post("/team/invitations")
        .set(a.owner.auth)
        .send({ name: "X", email: a.barber.email, role: "barber" });
      const inOther = await t
        .http()
        .post("/team/invitations")
        .set(a.owner.auth)
        .send({ name: "X", email: b.barber.email, role: "barber" });
      expect(inOwn.status).toBe(409);
      expect(inOther.status).toBe(409);
      expect(inOther.body).toEqual(inOwn.body);
      expect(ErrorBody.parse(inOwn.body).code).toBe("EMAIL_UNAVAILABLE");
    });

    it("if e-mail sending fails, the user and invitation are still created and invitationSent is false", async () => {
      const { owner } = await barbershop("Falha SMTP");
      t.email.failNext = true;
      const r = await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Eva",
        email: "eva-team@example.com",
        role: "barber",
      });
      expect(r.status).toBe(201);
      expect(InviteOutput.parse(r.body).invitationSent).toBe(false);
      const list = TeamOutput.parse(
        (await t.http().get("/team").set(owner.auth)).body,
      );
      expect(list.users.some((u) => u.email === "eva-team@example.com")).toBe(
        true,
      );
    });

    it("invalid data answers 400 with the fields", async () => {
      const { owner } = await barbershop("Invalid");
      const r = await t
        .http()
        .post("/team/invitations")
        .set(owner.auth)
        .send({ name: "", email: "x", role: "manager" });
      expect(r.status).toBe(400);
      expect(Object.keys(ErrorBody.parse(r.body).fields ?? {}).sort()).toEqual([
        "email",
        "name",
        "role",
      ]);
    });
  });

  describe("POST /team/{id}/resend-invitation", () => {
    async function invited(owner: Account, email: string) {
      const r = await t
        .http()
        .post("/team/invitations")
        .set(owner.auth)
        .send({ name: "Fred", email, role: "barber" });
      return {
        id: InviteOutput.parse(r.body).user.id,
        token: invitationTokenFrom(t.email.lastTo(email)?.text ?? ""),
      };
    }

    it("invalidates the previous link and sends another one, which works", async () => {
      const { owner } = await barbershop("Resends");
      const c = await invited(owner, "fred-resends@example.com");
      const r = await t
        .http()
        .post(`/team/${c.id}/resend-invitation`)
        .set(owner.auth);
      expect(r.status).toBe(200);
      expect(ResendOutput.parse(r.body).invitationSent).toBe(true);

      expect((await t.http().get(`/auth/invitations/${c.token}`)).status).toBe(
        410,
      );
      const next = invitationTokenFrom(
        t.email.lastTo("fred-resends@example.com")?.text ?? "",
      );
      expect(next).not.toBe(c.token);
      expect((await t.http().get(`/auth/invitations/${next}`)).status).toBe(
        200,
      );
    });

    it("a user who is not invited answers 409 USER_NOT_INVITED", async () => {
      const { owner, barber } = await barbershop("Reenvia ativo");
      const r = await t
        .http()
        .post(`/team/${barber.id}/resend-invitation`)
        .set(owner.auth);
      expect(r.status).toBe(409);
      expect(ErrorBody.parse(r.body).code).toBe("USER_NOT_INVITED");
    });
  });

  describe("POST /team/{id}/deactivate", () => {
    it("revokes open sessions immediately and refuses a new login (SC-004)", async () => {
      const { tenantId, owner, barber } = await barbershop("Deactivates");
      expect((await t.http().get("/auth/me").set(barber.auth)).status).toBe(
        200,
      );

      const r = await t
        .http()
        .post(`/team/${barber.id}/deactivate`)
        .set(owner.auth);
      expect(r.status).toBe(204);

      expect((await t.http().get("/auth/me").set(barber.auth)).status).toBe(
        401,
      );
      const login = await t
        .http()
        .post("/auth/login")
        .send({ email: barber.email, password: PASSWORD, client: "web" });
      expect(login.status).toBe(401);

      const [row] = await withTenantAdmin(tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, barber.id)),
      );
      expect(row).toMatchObject({ status: "deactivated" });
      expect(row?.deactivatedAt).toBeInstanceOf(Date);
      const ev = (await eventsOf(tenantId)).filter(
        (e) => e.type === "user_deactivated",
      );
      expect(ev).toMatchObject([
        { actorUserId: owner.id, targetUserId: barber.id },
      ]);
    });

    it("is idempotent: deactivating again answers 204 without a new event", async () => {
      const { tenantId, owner, barber } = await barbershop("Idempotent");
      await t.http().post(`/team/${barber.id}/deactivate`).set(owner.auth);
      expect(
        (await t.http().post(`/team/${barber.id}/deactivate`).set(owner.auth))
          .status,
      ).toBe(204);
      expect(
        (await eventsOf(tenantId)).filter((e) => e.type === "user_deactivated"),
      ).toHaveLength(1);
    });

    it("the only active owner cannot be deactivated, not even by themselves (409 LAST_OWNER)", async () => {
      const { owner } = await barbershop("Last owner");
      const r = await t
        .http()
        .post(`/team/${owner.id}/deactivate`)
        .set(owner.auth);
      expect(r.status).toBe(409);
      expect(ErrorBody.parse(r.body).code).toBe("LAST_OWNER");
      expect((await t.http().get("/auth/me").set(owner.auth)).status).toBe(200);
    });

    it("with two owners, one can deactivate the other; the remaining one becomes the last", async () => {
      const { tenantId, owner } = await barbershop("Dois donos");
      const partner = await account(tenantId, "owner", "Partner");
      expect(
        (await t.http().post(`/team/${partner.id}/deactivate`).set(owner.auth))
          .status,
      ).toBe(204);
      const r = await t
        .http()
        .post(`/team/${owner.id}/deactivate`)
        .set(owner.auth);
      expect(r.status).toBe(409);
    });

    it("deactivating an invitee cancels the pending invitation", async () => {
      const { owner } = await barbershop("Cancela convite");
      const r = await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Gil",
        email: "gil-team@example.com",
        role: "barber",
      });
      const id = InviteOutput.parse(r.body).user.id;
      const token = invitationTokenFrom(
        t.email.lastTo("gil-team@example.com")?.text ?? "",
      );
      expect(
        (await t.http().post(`/team/${id}/deactivate`).set(owner.auth)).status,
      ).toBe(204);
      expect((await t.http().get(`/auth/invitations/${token}`)).status).toBe(
        410,
      );
    });

    it("two owners deactivating each other at the same time: the barbershop never ends up without an active owner", async () => {
      const { tenantId, owner } = await barbershop("Race");
      const partner = await account(tenantId, "owner", "Partner");
      const responses = await Promise.all([
        t.http().post(`/team/${partner.id}/deactivate`).set(owner.auth),
        t.http().post(`/team/${owner.id}/deactivate`).set(partner.auth),
      ]);
      const status = responses.map((r) => r.status).sort();
      expect(status.filter((s) => s === 204)).toHaveLength(1);
      expect(status.filter((s) => s === 409 || s === 401)).toHaveLength(1);
      const owners = await withTenantAdmin(tenantId, (tx) =>
        tx.select().from(user),
      );
      expect(
        owners.filter((u) => u.role === "owner" && u.status === "active"),
      ).toHaveLength(1);
    });
  });

  describe("POST /team/{id}/reactivate", () => {
    it("with a password set it becomes active again and signs in with the same credentials", async () => {
      const { tenantId, owner, barber } = await barbershop("Reativa");
      await t.http().post(`/team/${barber.id}/deactivate`).set(owner.auth);
      expect(
        (await t.http().post(`/team/${barber.id}/reactivate`).set(owner.auth))
          .status,
      ).toBe(204);

      const login = await t
        .http()
        .post("/auth/login")
        .send({ email: barber.email, password: PASSWORD, client: "mobile" });
      expect(login.status).toBe(200);
      const [row] = await withTenantAdmin(tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, barber.id)),
      );
      expect(row).toMatchObject({ status: "active", deactivatedAt: null });
      expect(
        (await eventsOf(tenantId)).filter((e) => e.type === "user_reactivated"),
      ).toHaveLength(1);
    });

    it("without a password set it goes back to invited and gets a new invitation", async () => {
      const { tenantId, owner } = await barbershop("Reativa convidado");
      const r = await t.http().post("/team/invitations").set(owner.auth).send({
        name: "Hugo",
        email: "hugo-team@example.com",
        role: "barber",
      });
      const id = InviteOutput.parse(r.body).user.id;
      await t.http().post(`/team/${id}/deactivate`).set(owner.auth);
      t.email.clear();
      expect(
        (await t.http().post(`/team/${id}/reactivate`).set(owner.auth)).status,
      ).toBe(204);
      const [row] = await withTenantAdmin(tenantId, (tx) =>
        tx.select().from(user).where(eq(user.id, id)),
      );
      expect(row?.status).toBe("invited");
      expect(t.email.lastTo("hugo-team@example.com")?.text).toContain(
        "/invitation/",
      );
    });

    it("a user who is not deactivated answers 409 USER_NOT_DEACTIVATED", async () => {
      const { owner, barber } = await barbershop("Reativa ativo");
      const r = await t
        .http()
        .post(`/team/${barber.id}/reactivate`)
        .set(owner.auth);
      expect(r.status).toBe(409);
      expect(ErrorBody.parse(r.body).code).toBe("USER_NOT_DEACTIVATED");
    });
  });

  describe("isolation between barbershops", () => {
    it.each(["resend-invitation", "deactivate", "reactivate"])(
      "%s with another barbershop's id answers 404 NOT_FOUND, same as a nonexistent id",
      async (action) => {
        const a = await barbershop("Isola A");
        const b = await barbershop("Isola B");
        const deB = await t
          .http()
          .post(`/team/${b.barber.id}/${action}`)
          .set(a.owner.auth);
        const nonexistent = await t
          .http()
          .post(`/team/${ID_NONEXISTENT}/${action}`)
          .set(a.owner.auth);
        const malformed = await t
          .http()
          .post(`/team/not-a-uuid/${action}`)
          .set(a.owner.auth);
        expect(deB.status).toBe(404);
        expect(deB.body).toEqual(nonexistent.body);
        expect(malformed.status).toBe(404);
        expect(malformed.body).toEqual(nonexistent.body);
        expect(ErrorBody.parse(deB.body).code).toBe("NOT_FOUND");

        // And B's user stays exactly as it was.
        const [intact] = await withTenantAdmin(b.tenantId, (tx) =>
          tx.select().from(user).where(eq(user.id, b.barber.id)),
        );
        expect(intact?.status).toBe("active");
      },
    );
  });

  it("the admin connection does not see another tenant's team (harness sanity check)", async () => {
    const { rows } = await adminConnection().query(
      "select count(*)::int as n from users",
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
