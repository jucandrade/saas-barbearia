import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogEvent } from "../../src/db/schema/index.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { CatalogAuditService } from "../../src/catalog/catalog-audit.service.js";
import { runtimeConnection, closeConnections } from "./helpers/db.js";
import { createBarbershop, createUser } from "./helpers/factory.js";

describe("CatalogAuditService", () => {
  let tenantDb: TenantDb;
  let audit: CatalogAuditService;
  let tenantId: string;
  let ownerId: string;

  beforeAll(async () => {
    tenantDb = new TenantDb(runtimeConnection());
    audit = new CatalogAuditService();
    ({ barbershopId: tenantId } = await createBarbershop());
    ownerId = await createUser({ tenantId, role: "owner" });
  });

  afterAll(closeConnections);

  it("records the event inside the transaction, with author and time", async () => {
    await tenantDb.transaction(tenantId, (tx) =>
      audit.record(tx, tenantId, {
        type: "service_updated",
        actorUserId: ownerId,
        serviceId: ownerId,
        details: {
          fields: ["priceCents"],
          price: { from: 5000, to: 5500 },
        },
      }),
    );
    const events = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(catalogEvent),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tenantId,
      type: "service_updated",
      actorUserId: ownerId,
      details: { fields: ["priceCents"], price: { from: 5000, to: 5500 } },
    });
    expect(events[0]?.occurredAt).toBeInstanceOf(Date);
  });

  it("a rolled back transaction leaves no event behind", async () => {
    await expect(
      tenantDb.transaction(tenantId, async (tx) => {
        await audit.record(tx, tenantId, {
          type: "category_created",
          actorUserId: ownerId,
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const events = await tenantDb.transaction(tenantId, (tx) =>
      tx.select().from(catalogEvent),
    );
    expect(events.map((e) => e.type)).toEqual(["service_updated"]);
  });

  it.each(["email", "name", "password", "token", "ip", "link", "PasswordHash"])(
    "rejects the key %s in the details, even nested",
    async (key) => {
      await expect(
        tenantDb.transaction(tenantId, (tx) =>
          audit.record(tx, tenantId, {
            type: "service_updated",
            actorUserId: ownerId,
            details: { nested: [{ [key]: "value" }] },
          }),
        ),
      ).rejects.toThrow(/must not contain/);
    },
  );
});
