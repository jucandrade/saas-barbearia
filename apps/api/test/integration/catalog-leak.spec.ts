import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CategoriesOutput,
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
  linkExecutor,
} from "./helpers/factory.js";

/**
 * Barbershop B tries to reach barbershop A's catalog through every endpoint, with A's ids.
 * Nothing of A may be read, changed or even confirmed to exist (principle I, FR-013, SC-002).
 */
describe("catalog: no leak between barbershops", () => {
  let t: TestApp;
  let a: CatalogShop;
  let b: CatalogShop;
  let aCategory: string;
  let aService: string;
  let bCategory: string;
  let bService: string;

  beforeAll(async () => {
    t = await createApp();
    a = await createCatalogShop(t, "Leak A");
    b = await createCatalogShop(t, "Leak B");
    aCategory = await createCategory({ tenantId: a.tenantId, name: "Cabelo" });
    aService = await createService({
      tenantId: a.tenantId,
      categoryId: aCategory,
      name: "Corte",
    });
    await linkExecutor({
      tenantId: a.tenantId,
      serviceId: aService,
      userId: a.barber.id,
      priceCents: 6000,
    });
    bCategory = await createCategory({ tenantId: b.tenantId, name: "Barba" });
    bService = await createService({
      tenantId: b.tenantId,
      categoryId: bCategory,
      name: "Aparar",
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const asB = [
    ["owner", () => b.owner.auth],
    ["barber", () => b.barber.auth],
  ] as const;

  it.each(asB)("lists as B's %s show only B's catalog", async (_who, auth) => {
    const categories = CategoriesOutput.parse(
      (await t.http().get("/service-categories").set(auth())).body,
    ).categories;
    expect(categories.map((c) => c.id)).toEqual([bCategory]);
    const services = ServicesOutput.parse(
      (await t.http().get("/services").set(auth())).body,
    ).services;
    expect(services.map((s) => s.id)).toEqual([bService]);
  });

  it.each(asB)(
    "reads of A's records by B's %s answer 404",
    async (_who, auth) => {
      for (const path of [
        `/services/${aService}`,
        `/services/${aService}/executors`,
        `/services/${aService}/terms?userId=${a.barber.id}`,
      ]) {
        expectError(await t.http().get(path).set(auth()), 404, "NOT_FOUND");
      }
    },
  );

  it("writes by B's owner on A's records answer 404 or are refused as invalid, and change nothing", async () => {
    const owner = b.owner.auth;
    const before = await snapshotOfA();

    expectError(
      await t
        .http()
        .patch(`/service-categories/${aCategory}`)
        .set(owner)
        .send({ name: "Hacked" }),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().delete(`/service-categories/${aCategory}`).set(owner),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .put("/service-categories/order")
        .set(owner)
        .send({ ids: [aCategory] }),
      400,
      "INVALID_ORDER",
    );
    expectError(
      await t
        .http()
        .patch(`/services/${aService}`)
        .set(owner)
        .send({ priceCents: 1 }),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().post(`/services/${aService}/deactivate`).set(owner),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().post(`/services/${aService}/reactivate`).set(owner),
      404,
      "NOT_FOUND",
    );
    // A new service of B cannot go into A's category.
    const invalid = expectError(
      await t.http().post("/services").set(owner).send({
        name: "Intruso",
        categoryId: aCategory,
        priceCents: 1000,
        durationMinutes: 30,
      }),
      400,
      "INVALID_DATA",
    );
    expect(invalid.fields?.["categoryId"]).toBeTypeOf("string");
    // And B's service cannot be moved there either.
    expectError(
      await t
        .http()
        .patch(`/services/${bService}`)
        .set(owner)
        .send({ categoryId: aCategory }),
      400,
      "INVALID_DATA",
    );
    // Links: A's service with anyone, or B's service with A's people.
    expectError(
      await t
        .http()
        .put(`/services/${aService}/executors/${b.barber.id}`)
        .set(owner)
        .send({}),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .put(`/services/${bService}/executors/${a.barber.id}`)
        .set(owner)
        .send({}),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .delete(`/services/${aService}/executors/${a.barber.id}`)
        .set(owner),
      404,
      "NOT_FOUND",
    );

    expect(await snapshotOfA()).toEqual(before);
    expect(
      (await catalogEventsOf(b.tenantId)).some(
        (e) => e.serviceId === aService || e.categoryId === aCategory,
      ),
    ).toBe(false);
  });

  it("the same names in B are accepted, so a 409 never reveals A's catalog", async () => {
    const category = await t
      .http()
      .post("/service-categories")
      .set(b.owner.auth)
      .send({ name: "Cabelo" });
    expect(category.status).toBe(201);
    const service = await t
      .http()
      .post("/services")
      .set(b.owner.auth)
      .send({
        name: "Corte",
        categoryId: (category.body as { id: string }).id,
        priceCents: 3000,
        durationMinutes: 30,
      });
    expect(service.status).toBe(201);
  });

  it("an unknown id and another barbershop's id are indistinguishable", async () => {
    const unknown = await t
      .http()
      .get(`/services/${NONEXISTENT}`)
      .set(b.owner.auth);
    const foreign = await t
      .http()
      .get(`/services/${aService}`)
      .set(b.owner.auth);
    expect(foreign.status).toBe(unknown.status);
    expect(foreign.body).toEqual(unknown.body);
  });

  it("A keeps seeing its own catalog untouched", async () => {
    const services = ServicesOutput.parse(
      (await t.http().get("/services").set(a.owner.auth)).body,
    ).services;
    expect(services.map((s) => s.id)).toEqual([aService]);
    const executors = ExecutorsOutput.parse(
      (await t.http().get(`/services/${aService}/executors`).set(a.owner.auth))
        .body,
    ).executors;
    expect(executors.map((e) => e.userId)).toEqual([a.barber.id]);
  });

  async function snapshotOfA() {
    const auth = a.owner.auth;
    return {
      categories: (await t.http().get("/service-categories").set(auth))
        .body as unknown,
      services: (await t.http().get("/services").set(auth)).body as unknown,
      executors: (
        await t.http().get(`/services/${aService}/executors`).set(auth)
      ).body as unknown,
      events: (await catalogEventsOf(a.tenantId)).length,
    };
  }
});
