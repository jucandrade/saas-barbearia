import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runCli } from "../../src/cli/commands.js";
import {
  securityEvent,
  session,
  accessToken,
  user,
} from "../../src/db/schema/index.js";
import { PlatformError } from "../../src/identity/provisioning/platform-error.js";
import {
  withTenantAdmin,
  superConnection,
  closeConnections,
} from "./helpers/db.js";
import {
  createBarbershop,
  createEventInDatabase,
  createSessionInDatabase,
  createAccessToken,
  createUser,
} from "./helpers/factory.js";
import { createPlatformTools } from "./helpers/platform.js";

let n = 0;

/** Barbershop with an active owner and a deactivated barber, ready to be anonymized. */
async function scenario(options: { deactivate?: boolean } = {}) {
  n += 1;
  const { barbershopId: tenantId } = await createBarbershop(
    `Anonimiza ${String(n)}`,
  );
  await createUser({
    tenantId,
    role: "owner",
    email: `owner-anon-${String(n)}@example.com`,
  });
  const email = `person-anon-${String(n)}@example.com`;
  const name = `Pessoa Anon ${String(n)}`;
  const id = await createUser({
    tenantId,
    role: "barber",
    email,
    name,
    status: options.deactivate === false ? "active" : "deactivated",
  });
  await createSessionInDatabase({ tenantId, userId: id });
  await createAccessToken({
    tenantId,
    userId: id,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await createEventInDatabase(tenantId);
  return { tenantId, id, email, name };
}

const state = (tenantId: string, id: string) =>
  withTenantAdmin(tenantId, async (tx) => ({
    user: (await tx.select().from(user).where(eq(user.id, id)))[0],
    sessions: await tx.select().from(session).where(eq(session.userId, id)),
    tokens: await tx
      .select()
      .from(accessToken)
      .where(eq(accessToken.userId, id)),
  }));

describe("anonymize-user", () => {
  afterAll(closeConnections);

  it("anonymizes name and e-mail, erases the password, revokes sessions and tokens and sets the status", async () => {
    const f = createPlatformTools();
    const c = await scenario();
    const r = await f.anonymization.anonymize({ email: c.email });
    expect(r).toEqual({ userId: c.id, alreadyAnonymized: false });

    const after = await state(c.tenantId, c.id);
    expect(after.user).toMatchObject({
      name: "Usuário anonimizado",
      email: `anonymized-${c.id}@invalid`,
      passwordHash: null,
      status: "anonymized",
      failedAttempts: 0,
      lockedUntil: null,
    });
    expect(after.user?.anonymizedAt).toBeInstanceOf(Date);
    expect(after.sessions.every((s) => s.revokedAt !== null)).toBe(true);
    expect(
      after.tokens.every((t) => t.usedAt !== null || t.invalidatedAt !== null),
    ).toBe(true);
  });

  it("rejects a user who is not deactivated, advising to deactivate first", async () => {
    const f = createPlatformTools();
    const c = await scenario({ deactivate: false });
    await expect(f.anonymization.anonymize({ email: c.email })).rejects.toThrow(
      /deactivate/i,
    );
    expect((await state(c.tenantId, c.id)).user?.status).toBe("active");
  });

  it("rejects the last active owner of the barbershop", async () => {
    const f = createPlatformTools();
    const { barbershopId: tenantId } = await createBarbershop(
      "Anonymize last owner",
    );
    const email = "unique-owner-anon@example.com";
    const id = await createUser({
      tenantId,
      role: "owner",
      email,
      status: "active",
    });
    await expect(f.anonymization.anonymize({ email })).rejects.toBeInstanceOf(
      PlatformError,
    );
    expect((await state(tenantId, id)).user).toMatchObject({
      status: "active",
      email,
    });
  });

  it("a nonexistent e-mail fails with guidance", async () => {
    const f = createPlatformTools();
    await expect(
      f.anonymization.anonymize({ email: "nobody-anon@example.com" }),
    ).rejects.toBeInstanceOf(PlatformError);
  });

  it("is idempotent: repeating with the anonymized e-mail ends without error and without a new event", async () => {
    const f = createPlatformTools();
    const c = await scenario();
    await f.anonymization.anonymize({ email: c.email });
    const r = await f.anonymization.anonymize({
      email: `anonymized-${c.id}@invalid`,
    });
    expect(r).toEqual({ userId: c.id, alreadyAnonymized: true });
    const events = await withTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(securityEvent),
    );
    expect(events.filter((e) => e.type === "user_anonymized")).toHaveLength(1);
  });

  it("the original e-mail becomes free for a new registration", async () => {
    const f = createPlatformTools();
    const c = await scenario();
    await f.anonymization.anonymize({ email: c.email });
    expect(
      await f.tenantDb.withoutTenant().findUserByEmail(c.email),
    ).toBeUndefined();
    const { barbershopId } = await createBarbershop("Reusa e-mail");
    await expect(
      createUser({ tenantId: barbershopId, email: c.email }),
    ).resolves.toBeTypeOf("string");
  });

  it("earlier events stay in the trail, tied only to the id, without name or e-mail (SC-008)", async () => {
    const f = createPlatformTools();
    const c = await scenario();
    await withTenantAdmin(c.tenantId, (tx) =>
      tx.insert(securityEvent).values({
        tenantId: c.tenantId,
        type: "login_success",
        actorType: "user",
        actorUserId: c.id,
        targetUserId: c.id,
      }),
    );
    await f.anonymization.anonymize({ email: c.email });

    const events = await withTenantAdmin(c.tenantId, (tx) =>
      tx.select().from(securityEvent),
    );
    expect(
      events.some((e) => e.type === "login_success" && e.actorUserId === c.id),
    ).toBe(true);
    const anon = events.find((e) => e.type === "user_anonymized");
    expect(anon).toMatchObject({
      actorType: "platform",
      actorUserId: null,
      targetUserId: c.id,
    });

    // No table in the database keeps the original name or e-mail.
    for (const table of [
      "users",
      "security_events",
      "sessions",
      "access_tokens",
      "barbershops",
      "units",
    ]) {
      const { rows } = await superConnection().query<{ n: number }>(
        `select count(*)::int as n from ${table} t where to_jsonb(t)::text like $1 or to_jsonb(t)::text like $2`,
        [`%${c.email}%`, `%${c.name}%`],
      );
      expect(rows[0]?.n, `table ${table}`).toBe(0);
    }
  });

  describe("command", () => {
    const io = () => {
      const output: string[] = [];
      const error: string[] = [];
      return {
        output,
        error,
        io: {
          out: (m: string) => output.push(m),
          err: (m: string) => error.push(m),
        },
      };
    };

    it("exits with code 0 and identifies the user by id only, never by e-mail", async () => {
      const f = createPlatformTools();
      const c = await scenario();
      const output = io();
      expect(
        await runCli(["anonymize-user", "--email", c.email], f, output.io),
      ).toBe(0);
      const text = [...output.output, ...output.error].join("\n");
      expect(text).toContain(c.id);
      expect(text).not.toContain(c.email);
      expect(text).not.toContain(c.name);
    });

    it("repeating with the anonymized e-mail exits with code 0", async () => {
      const f = createPlatformTools();
      const c = await scenario();
      await runCli(["anonymize-user", "--email", c.email], f, io().io);
      expect(
        await runCli(
          ["anonymize-user", "--email", `anonymized-${c.id}@invalid`],
          f,
          io().io,
        ),
      ).toBe(0);
    });

    it("an active user exits with a non-zero code and asks to deactivate first", async () => {
      const f = createPlatformTools();
      const c = await scenario({ deactivate: false });
      const output = io();
      expect(
        await runCli(["anonymize-user", "--email", c.email], f, output.io),
      ).not.toBe(0);
      expect(output.error.join("\n")).toMatch(/deactivate/i);
      expect(output.error.join("\n")).not.toContain(c.email);
    });

    it("without --email it exits with a non-zero code", async () => {
      const f = createPlatformTools();
      expect(await runCli(["anonymize-user"], f, io().io)).not.toBe(0);
    });
  });
});
