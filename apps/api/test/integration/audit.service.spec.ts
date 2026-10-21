import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { securityEvent } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { AuditService } from "../../src/identity/audit/audit.service.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

describe("AuditService", () => {
  let tenantDb: TenantDb;
  let audit: AuditService;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    audit = new AuditService(runtimeConnection());
    ({ barbershopId: tenantId } = await createBarbershop());
    userId = await createUser({ tenantId, role: "owner" });
  });

  afterAll(closeConnections);

  it("records the event inside the transaction, with actor and time", async () => {
    await tenantDb.transaction(tenantId, (tx) =>
      audit.record(tx, tenantId, {
        type: "login_success",
        actorType: "user",
        actorUserId: userId,
        targetUserId: userId,
        details: { role: "owner" },
      }),
    );
    const events = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(securityEvent),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId,
      type: "login_success",
      actorType: "user",
      actorUserId: userId,
      details: { role: "owner" },
    });
    expect(events[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it.each(["email", "name", "password", "token", "ip", "link", "PasswordHash"])(
    "rejects the key %s in the details, even nested",
    async (key) => {
      await expect(
        tenantDb.transaction(tenantId, (tx) =>
          audit.record(tx, tenantId, {
            type: "login_failure",
            actorType: "system",
            details: { external: { [key]: "value" } },
          }),
        ),
      ).rejects.toThrow(/must not contain/);
    },
  );

  it("an event without a tenant (unknown e-mail) is stored and visible to no barbershop", async () => {
    await audit.recordWithoutTenant({
      type: "login_failure",
      actorType: "system",
    });
    const visible = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(securityEvent),
    );
    expect(visible.every((e) => e.tenantId === tenantId)).toBe(true);
    const { rows } = await runtimeConnection().query(
      "select count(*)::int as n from security_events",
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});
