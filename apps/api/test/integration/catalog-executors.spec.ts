import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Executor,
  ExecutorsOutput,
  ServicesOutput,
} from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  NONEXISTENT,
  catalogEventsOf,
  createCatalogShop,
  type CatalogShop,
} from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections } from "./helpers/db.js";
import {
  createCategory,
  createService,
  createUser,
} from "./helpers/factory.js";

describe("catalog executors", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function shopWithService(): Promise<
    CatalogShop & { serviceId: string; categoryId: string }
  > {
    const shop = await createCatalogShop(t);
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    const serviceId = await createService({
      tenantId: shop.tenantId,
      categoryId,
    });
    return { ...shop, serviceId, categoryId };
  }

  const link = (
    auth: { Authorization: string },
    serviceId: string,
    userId: string,
    body: object = {},
  ) =>
    t
      .http()
      .put(`/services/${serviceId}/executors/${userId}`)
      .set(auth)
      .send(body);

  const unlink = (
    auth: { Authorization: string },
    serviceId: string,
    userId: string,
  ) => t.http().delete(`/services/${serviceId}/executors/${userId}`).set(auth);

  const executorsOf = async (
    auth: { Authorization: string },
    serviceId: string,
  ) =>
    ExecutorsOutput.parse(
      (await t.http().get(`/services/${serviceId}/executors`).set(auth)).body,
    ).executors;

  const countFor = async (auth: { Authorization: string }, serviceId: string) =>
    ServicesOutput.parse(
      (await t.http().get("/services").set(auth)).body,
    ).services.find((s) => s.id === serviceId)?.executorCount;

  it("the owner links a barber and himself, and the list returns exactly those two", async () => {
    const shop = await shopWithService();
    const barber = await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    expect(barber.status).toBe(200);
    expect(Executor.parse(barber.body)).toMatchObject({
      userId: shop.barber.id,
      name: "Bruno Barbeiro",
      priceCents: null,
      durationMinutes: null,
    });
    expect(
      (await link(shop.owner.auth, shop.serviceId, shop.owner.id)).status,
    ).toBe(200);

    const list = await executorsOf(shop.owner.auth, shop.serviceId);
    expect(list.map((e) => e.userId).sort()).toEqual(
      [shop.owner.id, shop.barber.id].sort(),
    );
  });

  it("never exposes an e-mail", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    const response = await t
      .http()
      .get(`/services/${shop.serviceId}/executors`)
      .set(shop.owner.auth);
    expect(JSON.stringify(response.body)).not.toMatch(/@example\.com/);
  });

  it("linking is idempotent and writes the event only once", async () => {
    const shop = await shopWithService();
    expect(
      (await link(shop.owner.auth, shop.serviceId, shop.barber.id)).status,
    ).toBe(200);
    expect(
      (await link(shop.owner.auth, shop.serviceId, shop.barber.id)).status,
    ).toBe(200);
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toHaveLength(1);
    const events = (await catalogEventsOf(shop.tenantId)).map((e) => e.type);
    expect(events).toEqual(["executor_linked"]);
  });

  it("refuses invited, deactivated and anonymized users with EXECUTOR_NOT_ELIGIBLE", async () => {
    const shop = await shopWithService();
    for (const status of ["invited", "deactivated", "anonymized"] as const) {
      const userId = await createUser({ tenantId: shop.tenantId, status });
      expectError(
        await link(shop.owner.auth, shop.serviceId, userId),
        409,
        "EXECUTOR_NOT_ELIGIBLE",
      );
    }
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toEqual([]);
  });

  it("answers 404 for a user of another barbershop, an unknown user and an unknown service", async () => {
    const shop = await shopWithService();
    const other = await shopWithService();
    for (const [serviceId, userId] of [
      [shop.serviceId, other.barber.id],
      [shop.serviceId, NONEXISTENT],
      [NONEXISTENT, shop.barber.id],
      [other.serviceId, shop.barber.id],
    ] as const) {
      expectError(
        await link(shop.owner.auth, serviceId, userId),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("unlinking is idempotent and an unknown service answers 404", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    expect(
      (await unlink(shop.owner.auth, shop.serviceId, shop.barber.id)).status,
    ).toBe(204);
    expect(
      (await unlink(shop.owner.auth, shop.serviceId, shop.barber.id)).status,
    ).toBe(204);
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toEqual([]);
    expect((await catalogEventsOf(shop.tenantId)).map((e) => e.type)).toEqual([
      "executor_linked",
      "executor_unlinked",
    ]);
    expectError(
      await unlink(shop.owner.auth, NONEXISTENT, shop.barber.id),
      404,
      "NOT_FOUND",
    );
  });

  it("a deactivated user leaves the list and comes back, with the link and values, when reactivated", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id, {
      priceCents: 6000,
    });
    await t
      .http()
      .post(`/team/${shop.barber.id}/deactivate`)
      .set(shop.owner.auth);
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toEqual([]);
    expect(await countFor(shop.owner.auth, shop.serviceId)).toBe(0);

    await t
      .http()
      .post(`/team/${shop.barber.id}/reactivate`)
      .set(shop.owner.auth);
    const back = await executorsOf(shop.owner.auth, shop.serviceId);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ userId: shop.barber.id, priceCents: 6000 });
  });

  it("executorCount is for owners, counts active executors and is 0 without any", async () => {
    const shop = await shopWithService();
    expect(await countFor(shop.owner.auth, shop.serviceId)).toBe(0);
    await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    await link(shop.owner.auth, shop.serviceId, shop.owner.id);
    expect(await countFor(shop.owner.auth, shop.serviceId)).toBe(2);
    expect(await countFor(shop.barber.auth, shop.serviceId)).toBeUndefined();
  });

  it("deactivating and reactivating the service keeps its links (SC-005)", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id, {
      durationMinutes: 45,
    });
    const before = await executorsOf(shop.owner.auth, shop.serviceId);
    await t
      .http()
      .post(`/services/${shop.serviceId}/deactivate`)
      .set(shop.owner.auth);
    await t
      .http()
      .post(`/services/${shop.serviceId}/reactivate`)
      .set(shop.owner.auth);
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toEqual(before);
  });

  it("the link accepts specific values, validated like the service's, and updates them", async () => {
    const shop = await shopWithService();
    const set = await link(shop.owner.auth, shop.serviceId, shop.barber.id, {
      priceCents: 6000,
      durationMinutes: 45,
    });
    expect(Executor.parse(set.body)).toMatchObject({
      priceCents: 6000,
      durationMinutes: 45,
    });
    const invalid = expectError(
      await link(shop.owner.auth, shop.serviceId, shop.barber.id, {
        durationMinutes: 37,
        priceCents: -1,
      }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {}).sort()).toEqual([
      "durationMinutes",
      "priceCents",
    ]);
    const kept = await executorsOf(shop.owner.auth, shop.serviceId);
    expect(kept[0]).toMatchObject({ priceCents: 6000, durationMinutes: 45 });
  });

  it("records executor_linked and executor_unlinked with author, service and user, and no personal data", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    await unlink(shop.owner.auth, shop.serviceId, shop.barber.id);
    const events = await catalogEventsOf(shop.tenantId);
    expect(events.map((e) => e.type)).toEqual([
      "executor_linked",
      "executor_unlinked",
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        actorUserId: shop.owner.id,
        serviceId: shop.serviceId,
        targetUserId: shop.barber.id,
      });
    }
    expect(JSON.stringify(events.map((e) => e.details))).not.toMatch(
      /Bruno|Dona Ana|example\.com/,
    );
  });

  it("a barber reads the executors but cannot link or unlink; a visitor gets 401", async () => {
    const shop = await shopWithService();
    await link(shop.owner.auth, shop.serviceId, shop.barber.id);
    const read = await t
      .http()
      .get(`/services/${shop.serviceId}/executors`)
      .set(shop.barber.auth);
    expect(read.status).toBe(200);
    expectError(
      await link(shop.barber.auth, shop.serviceId, shop.barber.id),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await unlink(shop.barber.auth, shop.serviceId, shop.barber.id),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().get(`/services/${shop.serviceId}/executors`),
      401,
      "INVALID_SESSION",
    );
    expect(await executorsOf(shop.owner.auth, shop.serviceId)).toHaveLength(1);
  });
});
