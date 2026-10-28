import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brandingEvent } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { BrandingAuditService } from "../../src/branding/branding-audit.service.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

describe("BrandingAuditService", () => {
  let tenantDb: TenantDb;
  let audit: BrandingAuditService;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    audit = new BrandingAuditService();
    ({ barbershopId: tenantId } = await createBarbershop());
    ownerId = await createUser({ tenantId, role: "owner" });
  });

  afterAll(closeConnections);

  it("records the event inside the transaction, with author and time", async () => {
    await tenantDb.transaction(tenantId, (tx) =>
      audit.record(tx, tenantId, {
        type: "branding_updated",
        actorUserId: ownerId,
        details: {
          fields: ["displayName", "theme", "primaryTone"],
          theme: { from: "noir", to: "day" },
          primaryTone: { from: "gold", to: "blue" },
        },
      }),
    );
    const events = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(brandingEvent),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId,
      type: "branding_updated",
      actorUserId: ownerId,
      details: {
        fields: ["displayName", "theme", "primaryTone"],
        theme: { from: "noir", to: "day" },
        primaryTone: { from: "gold", to: "blue" },
      },
    });
    expect(events[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it("a rolled back transaction leaves no event behind", async () => {
    await expect(
      tenantDb.transaction(tenantId, async (tx) => {
        await audit.record(tx, tenantId, {
          type: "logo_removed",
          actorUserId: ownerId,
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const events = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(brandingEvent),
    );
    expect(events.map((e) => e.type)).toEqual(["branding_updated"]);
  });

  it.each([
    "email",
    "name",
    "password",
    "token",
    "ip",
    "link",
    "PasswordHash",
    "content",
    "logo",
    "bytes",
    "filename",
  ])("rejects the key %s in the details, even nested", async (key) => {
    await expect(
      tenantDb.transaction(tenantId, (tx) =>
        audit.record(tx, tenantId, {
          type: "logo_changed",
          actorUserId: ownerId,
          details: { nested: [{ [key]: "value" }] },
        }),
      ),
    ).rejects.toThrow(/must not contain/);
  });
});
