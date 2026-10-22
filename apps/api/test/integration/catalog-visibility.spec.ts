import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CategoriesOutput,
  ExecutorsOutput,
  ServicesOutput,
} from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import { createCatalogShop, type CatalogShop } from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections } from "./helpers/db.js";
import {
  createCategory,
  createService,
  createUser,
  linkExecutor,
} from "./helpers/factory.js";

describe("catalog visibility: who sees what", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  /** A shop with a second barber, three active services and one deactivated. */
  async function scenario() {
    const shop: CatalogShop = await createCatalogShop(t);
    const second = await createUser({
      tenantId: shop.tenantId,
      role: "barber",
      name: "Carla Barbeira",
    });
    const secondAuth = {
      Authorization: `Bearer ${await t.openSession({
        id: second,
        tenantId: shop.tenantId,
        role: "barber",
      })}`,
    };
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    const mk = (name: string, status: "active" | "deactivated" = "active") =>
      createService({
        tenantId: shop.tenantId,
        categoryId,
        name,
        status,
        priceCents: 5000,
        durationMinutes: 30,
      });
    const cut = await mk("Corte");
    const beard = await mk("Barba");
    const combo = await mk("Combo");
    const old = await mk("Antigo", "deactivated");
    return { shop, second, secondAuth, categoryId, cut, beard, combo, old };
  }

  const servicesFor = async (auth: { Authorization: string }) =>
    ServicesOutput.parse((await controlled(auth)).body).services;
  const controlled = (auth: { Authorization: string }) =>
    t.http().get("/services").set(auth);

  it("a barber sees every active service of the shop and none that is deactivated", async () => {
    const s = await scenario();
    const seen = await servicesFor(s.shop.barber.auth);
    expect(seen.map((x) => x.id).sort()).toEqual(
      [s.cut, s.beard, s.combo].sort(),
    );
    expect(seen.every((x) => x.status === "active")).toBe(true);
  });

  it("marks only the services the barber performs", async () => {
    const s = await scenario();
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.shop.barber.id,
    });
    const seen = await servicesFor(s.shop.barber.auth);
    expect(Object.fromEntries(seen.map((x) => [x.id, x.mine]))).toEqual({
      [s.cut]: true,
      [s.beard]: false,
      [s.combo]: false,
    });
  });

  it("effective carries the barber's specific values where he performs the service, the default elsewhere", async () => {
    const s = await scenario();
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.shop.barber.id,
      priceCents: 6000,
      durationMinutes: 45,
    });
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.beard,
      userId: s.shop.barber.id,
      priceCents: 4000,
    });
    const byId = new Map(
      (await servicesFor(s.shop.barber.auth)).map((x) => [x.id, x]),
    );
    expect(byId.get(s.cut)?.effective).toEqual({
      priceCents: 6000,
      durationMinutes: 45,
    });
    // Only the price is specific: the duration falls back to the service default.
    expect(byId.get(s.beard)?.effective).toEqual({
      priceCents: 4000,
      durationMinutes: 30,
    });
    expect(byId.get(s.combo)?.effective).toEqual({
      priceCents: 5000,
      durationMinutes: 30,
    });
    // The service defaults are still there for everyone.
    expect(byId.get(s.cut)).toMatchObject({
      priceCents: 5000,
      durationMinutes: 30,
    });
  });

  it("two barbers with different values in the same service each see their own", async () => {
    const s = await scenario();
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.shop.barber.id,
      priceCents: 6000,
    });
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.second,
      priceCents: 7000,
    });
    const first = (await servicesFor(s.shop.barber.auth)).find(
      (x) => x.id === s.cut,
    );
    const other = (await servicesFor(s.secondAuth)).find((x) => x.id === s.cut);
    expect(first?.effective.priceCents).toBe(6000);
    expect(other?.effective.priceCents).toBe(7000);
  });

  it("an owner who also performs a service sees mine and effective as his own", async () => {
    const s = await scenario();
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.shop.owner.id,
      durationMinutes: 60,
    });
    const seen = await servicesFor(s.shop.owner.auth);
    const cut = seen.find((x) => x.id === s.cut);
    expect(cut).toMatchObject({
      mine: true,
      durationMinutes: 30,
      effective: { priceCents: 5000, durationMinutes: 60 },
      executorCount: 1,
    });
    expect(seen.find((x) => x.id === s.beard)?.mine).toBe(false);
    // The owner also sees the deactivated one.
    expect(seen.map((x) => x.id)).toContain(s.old);
  });

  it("a barber sees colleagues' names but only his own specific values", async () => {
    const s = await scenario();
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.shop.barber.id,
      priceCents: 6000,
    });
    await linkExecutor({
      tenantId: s.shop.tenantId,
      serviceId: s.cut,
      userId: s.second,
      priceCents: 7000,
    });
    const asFirst = ExecutorsOutput.parse(
      (
        await t
          .http()
          .get(`/services/${s.cut}/executors`)
          .set(s.shop.barber.auth)
      ).body,
    ).executors;
    expect(asFirst.map((e) => e.name).sort()).toEqual([
      "Bruno Barbeiro",
      "Carla Barbeira",
    ]);
    const mine = asFirst.find((e) => e.userId === s.shop.barber.id);
    const colleague = asFirst.find((e) => e.userId === s.second);
    expect(mine?.priceCents).toBe(6000);
    expect(colleague).toBeDefined();
    expect(colleague?.priceCents).toBeUndefined();
    expect(colleague?.durationMinutes).toBeUndefined();

    const asOwner = ExecutorsOutput.parse(
      (
        await t
          .http()
          .get(`/services/${s.cut}/executors`)
          .set(s.shop.owner.auth)
      ).body,
    ).executors;
    expect(asOwner.find((e) => e.userId === s.second)?.priceCents).toBe(7000);
  });

  it("a barber reads the categories too", async () => {
    const s = await scenario();
    const response = await t
      .http()
      .get("/service-categories")
      .set(s.shop.barber.auth);
    expect(CategoriesOutput.parse(response.body).categories).toHaveLength(1);
  });

  it("a visitor is refused everywhere", async () => {
    const s = await scenario();
    for (const path of [
      "/services",
      `/services/${s.cut}`,
      `/services/${s.cut}/executors`,
      "/service-categories",
    ]) {
      expectError(await t.http().get(path), 401, "INVALID_SESSION");
    }
  });

  it("users of two barbershops never see each other's catalog", async () => {
    const a = await scenario();
    const b = await scenario();
    const seenByB = await servicesFor(b.shop.barber.auth);
    const idsOfA = new Set([a.cut, a.beard, a.combo, a.old]);
    expect(seenByB.some((x) => idsOfA.has(x.id))).toBe(false);
    expectError(
      await t.http().get(`/services/${a.cut}`).set(b.shop.barber.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .get(`/services/${a.cut}/executors`)
        .set(b.shop.barber.auth),
      404,
      "NOT_FOUND",
    );
    const categories = CategoriesOutput.parse(
      (await t.http().get("/service-categories").set(b.shop.barber.auth)).body,
    ).categories;
    expect(categories.map((c) => c.id)).not.toContain(a.categoryId);
  });

  it("a barber cannot see a deactivated service or its executors", async () => {
    const s = await scenario();
    expectError(
      await t.http().get(`/services/${s.old}`).set(s.shop.barber.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .get(`/services/${s.old}/executors`)
        .set(s.shop.barber.auth),
      404,
      "NOT_FOUND",
    );
  });
});
