import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { barbershop, user } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

/** Drizzle wraps the Postgres error in `cause`; joins both messages. */
async function errorMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return [
      error instanceof Error ? error.message : String(error),
      cause instanceof Error ? cause.message : "",
    ].join(" | ");
  }
  throw new Error("expected a failure, but the operation succeeded");
}

describe("TenantDb", () => {
  let tenantDb: TenantDb;
  let a: { barbershopId: string; userId: string; email: string };
  let b: { barbershopId: string; userId: string; email: string };

  async function assemble(name: string, email: string) {
    const { barbershopId } = await createBarbershop(name);
    const userId = await createUser({
      tenantId: barbershopId,
      email,
      role: "owner",
    });
    return { barbershopId, userId, email };
  }

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    a = await assemble("Barbearia A", "owner-a@example.com");
    b = await assemble("Barbearia B", "owner-b@example.com");
  });

  afterAll(closeConnections);

  it("with A's context, sees only A's rows", async () => {
    const users = await tenantDb.transaction(a.barbershopId, (tx) =>
      tx.select({ id: user.id }).from(user),
    );
    expect(users.map((u) => u.id)).toEqual([a.userId]);

    const barbershops = await tenantDb.transaction(a.barbershopId, (tx) =>
      tx.select({ id: barbershop.id }).from(barbershop),
    );
    expect(barbershops.map((x) => x.id)).toEqual([a.barbershopId]);
  });

  it("without a context, SELECT returns 0 rows", async () => {
    const result = await runtimeConnection().query("select id from users");
    expect(result.rowCount).toBe(0);
  });

  it("without a context, INSERT fails on RLS", async () => {
    const message = await errorMessage(
      runtimeConnection().query(
        "insert into users (tenant_id, name, email, role, status) values (gen_random_uuid(), 'X', 'x@example.com', 'barber', 'invited')",
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("the API has no permission to create a barbershop (only the product team)", async () => {
    const message = await errorMessage(
      runtimeConnection().query(
        "insert into barbershops (name) values ('No permission')",
      ),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("A's context cannot write a row with B's tenant", async () => {
    const message = await errorMessage(
      tenantDb.transaction(a.barbershopId, (tx) =>
        tx.insert(user).values({
          tenantId: b.barbershopId,
          name: "Intruder",
          email: "intruder@example.com",
          role: "barber",
          status: "invited",
        }),
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("A's context cannot change B's rows", async () => {
    const updated = await tenantDb.transaction(a.barbershopId, (tx) =>
      tx.update(user).set({ name: "Hacked" }).returning({ id: user.id }),
    );
    expect(updated.map((u) => u.id)).toEqual([a.userId]);
    const doB = await tenantDb.transaction(b.barbershopId, (tx) =>
      tx.select({ name: user.name }).from(user),
    );
    expect(doB[0]?.name).toBe("Test User");
  });

  it("passes the tenant as a parameter: a malicious value is refused and nothing is executed", async () => {
    await expect(
      tenantDb.transaction("'; drop table usuario; --", (tx) =>
        tx.select().from(user),
      ),
    ).rejects.toThrow(/tenant/i);
    const exists = await runtimeConnection().query(
      "select to_regclass('public.users') as table",
    );
    expect(exists.rows[0]).toEqual({ table: "users" });
  });

  it("the context is valid only inside the transaction", async () => {
    await tenantDb.transaction(a.barbershopId, async (tx) => {
      const { rows } = await tx.execute<{ value: string }>(
        sql`select current_setting('app.tenant_id', true) as value`,
      );
      expect(rows[0]?.value).toBe(a.barbershopId);
    });
    const { rows } = await runtimeConnection().query<{ value: string | null }>(
      "select nullif(current_setting('app.tenant_id', true), '') as value",
    );
    expect(rows[0]?.value).toBeNull();
  });

  describe("withoutTenant (authentication functions)", () => {
    it("finds the user by e-mail without a context, in any barbershop", async () => {
      const doA = await tenantDb.withoutTenant().findUserByEmail(a.email);
      expect(doA).toMatchObject({
        id: a.userId,
        tenantId: a.barbershopId,
        role: "owner",
        status: "active",
        failedAttempts: 0,
        lockedUntil: null,
      });
      const doB = await tenantDb.withoutTenant().findUserByEmail(b.email);
      expect(doB?.tenantId).toBe(b.barbershopId);
    });

    it("returns undefined for an unknown e-mail", async () => {
      expect(
        await tenantDb.withoutTenant().findUserByEmail("nobody@example.com"),
      ).toBeUndefined();
    });

    it("exposes only the three authentication functions", () => {
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(tenantDb.withoutTenant()),
      ).sort();
      expect(methods).toEqual([
        "constructor",
        "findAccessToken",
        "findSession",
        "findUserByEmail",
      ]);
    });
  });
});
