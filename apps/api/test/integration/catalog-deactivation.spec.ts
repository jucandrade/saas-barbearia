import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Service, ServicesOutput } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { service } from "../../src/db/schema/index.js";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  NONEXISTENT,
  catalogEventsOf,
  createCatalogShop,
  type CatalogShop,
} from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections, withTenantAdmin } from "./helpers/db.js";
import { createCategory, createService } from "./helpers/factory.js";

describe("catalog: deactivate and reactivate services", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function shopWithService(
    name = "Corte",
  ): Promise<CatalogShop & { categoryId: string; serviceId: string }> {
    const shop = await createCatalogShop(t);
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    const serviceId = await createService({
      tenantId: shop.tenantId,
      categoryId,
      name,
    });
    return { ...shop, categoryId, serviceId };
  }

  const deactivate = (auth: { Authorization: string }, id: string) =>
    t.http().post(`/services/${id}/deactivate`).set(auth);
  const reactivate = (auth: { Authorization: string }, id: string) =>
    t.http().post(`/services/${id}/reactivate`).set(auth);
  const listFor = async (auth: { Authorization: string }, query = "") =>
    ServicesOutput.parse(
      (await t.http().get(`/services${query}`).set(auth)).body,
    ).services;

  it("deactivating takes the service out of the barber's list and the owner sees it as deactivated", async () => {
    const shop = await shopWithService();
    const response = await deactivate(shop.owner.auth, shop.serviceId);
    expect(response.status).toBe(204);
    expect(response.text).toBe("");

    expect(await listFor(shop.barber.auth)).toEqual([]);
    expect(await listFor(shop.owner.auth, "?status=active")).toEqual([]);
    const deactivated = await listFor(shop.owner.auth, "?status=deactivated");
    expect(deactivated.map((s) => [s.id, s.status])).toEqual([
      [shop.serviceId, "deactivated"],
    ]);
    expect((await listFor(shop.owner.auth)).map((s) => s.status)).toEqual([
      "deactivated",
    ]);
  });

  it("a barber gets 404 for a deactivated service, the owner still reads it", async () => {
    const shop = await shopWithService();
    await deactivate(shop.owner.auth, shop.serviceId);
    expectError(
      await t.http().get(`/services/${shop.serviceId}`).set(shop.barber.auth),
      404,
      "NOT_FOUND",
    );
    const owner = await t
      .http()
      .get(`/services/${shop.serviceId}`)
      .set(shop.owner.auth);
    expect(Service.parse(owner.body).status).toBe("deactivated");
  });

  it("reactivating brings it back to everyone, with the same data", async () => {
    const shop = await shopWithService();
    const before = await listFor(shop.owner.auth);
    await deactivate(shop.owner.auth, shop.serviceId);
    const response = await reactivate(shop.owner.auth, shop.serviceId);
    expect(response.status).toBe(204);
    expect(await listFor(shop.owner.auth)).toEqual(before);
    expect(await listFor(shop.barber.auth)).toEqual(before);
  });

  it("repeating either action is idempotent and writes no new event", async () => {
    const shop = await shopWithService();
    expect((await reactivate(shop.owner.auth, shop.serviceId)).status).toBe(
      204,
    );
    expect((await deactivate(shop.owner.auth, shop.serviceId)).status).toBe(
      204,
    );
    expect((await deactivate(shop.owner.auth, shop.serviceId)).status).toBe(
      204,
    );
    const types = (await catalogEventsOf(shop.tenantId)).map((e) => e.type);
    expect(types).toEqual(["service_deactivated"]);
    await reactivate(shop.owner.auth, shop.serviceId);
    await reactivate(shop.owner.auth, shop.serviceId);
    expect((await catalogEventsOf(shop.tenantId)).map((e) => e.type)).toEqual([
      "service_deactivated",
      "service_reactivated",
    ]);
  });

  it("events carry the author and the service", async () => {
    const shop = await shopWithService();
    await deactivate(shop.owner.auth, shop.serviceId);
    await reactivate(shop.owner.auth, shop.serviceId);
    const events = await catalogEventsOf(shop.tenantId);
    expect(
      events.every(
        (e) =>
          e.actorUserId === shop.owner.id && e.serviceId === shop.serviceId,
      ),
    ).toBe(true);
  });

  it("the owner can still edit a deactivated service", async () => {
    const shop = await shopWithService();
    await deactivate(shop.owner.auth, shop.serviceId);
    const response = await t
      .http()
      .patch(`/services/${shop.serviceId}`)
      .set(shop.owner.auth)
      .send({ priceCents: 7000 });
    expect(response.status).toBe(200);
    expect(Service.parse(response.body)).toMatchObject({
      priceCents: 7000,
      status: "deactivated",
    });
  });

  it("a deactivated service still reserves its name", async () => {
    const shop = await shopWithService("Corte");
    await deactivate(shop.owner.auth, shop.serviceId);
    expectError(
      await t.http().post("/services").set(shop.owner.auth).send({
        name: "corte",
        categoryId: shop.categoryId,
        priceCents: 1000,
        durationMinutes: 30,
      }),
      409,
      "SERVICE_NAME_TAKEN",
    );
  });

  it("a deactivate/reactivate cycle leaves the row identical except updated_at (SC-005)", async () => {
    const shop = await shopWithService();
    const read = () =>
      withTenantAdmin(shop.tenantId, (tx) =>
        tx.select().from(service).where(eq(service.id, shop.serviceId)),
      ).then(([row]) => {
        if (row === undefined) throw new Error("service not found");
        return { ...row, updatedAt: null };
      });
    const before = await read();
    await deactivate(shop.owner.auth, shop.serviceId);
    await reactivate(shop.owner.auth, shop.serviceId);
    expect(await read()).toEqual(before);
  });

  it("there is no way to delete a service over HTTP", async () => {
    const shop = await shopWithService();
    const response = await t
      .http()
      .delete(`/services/${shop.serviceId}`)
      .set(shop.owner.auth);
    expect(response.status).toBe(404);
    expect((await listFor(shop.owner.auth)).map((s) => s.id)).toEqual([
      shop.serviceId,
    ]);
  });

  it("unknown, malformed and foreign ids answer 404", async () => {
    const shop = await shopWithService();
    const other = await shopWithService("Outro");
    for (const id of [NONEXISTENT, "not-an-id", other.serviceId]) {
      expectError(await deactivate(shop.owner.auth, id), 404, "NOT_FOUND");
      expectError(await reactivate(shop.owner.auth, id), 404, "NOT_FOUND");
    }
  });

  it("a barber and a visitor cannot deactivate or reactivate", async () => {
    const shop = await shopWithService();
    expectError(
      await deactivate(shop.barber.auth, shop.serviceId),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await reactivate(shop.barber.auth, shop.serviceId),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().post(`/services/${shop.serviceId}/deactivate`),
      401,
      "INVALID_SESSION",
    );
    expect((await listFor(shop.owner.auth))[0]?.status).toBe("active");
  });
});
