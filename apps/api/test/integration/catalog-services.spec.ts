import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Service, ServicesOutput } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  NONEXISTENT,
  catalogEventsOf,
  createCatalogShop,
  type CatalogShop,
} from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections } from "./helpers/db.js";
import { createCategory, createService } from "./helpers/factory.js";

describe("catalog services", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const valid = (categoryId: string, name = "Corte") => ({
    name,
    categoryId,
    priceCents: 5000,
    durationMinutes: 30,
  });

  async function shopWithCategory(): Promise<
    CatalogShop & { categoryId: string }
  > {
    const shop = await createCatalogShop(t);
    const categoryId = await createCategory({
      tenantId: shop.tenantId,
      name: "Cabelo",
    });
    return { ...shop, categoryId };
  }

  const create = (auth: { Authorization: string }, body: object) =>
    t.http().post("/services").set(auth).send(body);

  const listAll = async (auth: { Authorization: string }) =>
    ServicesOutput.parse((await t.http().get("/services").set(auth)).body)
      .services;

  it("the owner creates a service and it shows up in the list with the data given", async () => {
    const shop = await shopWithCategory();
    const response = await create(shop.owner.auth, {
      ...valid(shop.categoryId),
      description: "Na tesoura",
    });
    expect(response.status).toBe(201);
    const created = Service.parse(response.body);
    expect(created).toMatchObject({
      name: "Corte",
      description: "Na tesoura",
      categoryId: shop.categoryId,
      priceCents: 5000,
      durationMinutes: 30,
      status: "active",
    });
    const listed = await listAll(shop.owner.auth);
    expect(listed.map((s) => s.id)).toEqual([created.id]);
  });

  it("a blank description becomes null", async () => {
    const shop = await shopWithCategory();
    const response = await create(shop.owner.auth, {
      ...valid(shop.categoryId),
      description: "   ",
    });
    expect(Service.parse(response.body).description).toBeNull();
  });

  it("a free service (price zero) is accepted", async () => {
    const shop = await shopWithCategory();
    const response = await create(shop.owner.auth, {
      ...valid(shop.categoryId, "Cortesia"),
      priceCents: 0,
    });
    expect(response.status).toBe(201);
  });

  it.each([
    ["name", { name: "" }],
    ["name", { name: "a".repeat(81) }],
    ["durationMinutes", { durationMinutes: 37 }],
    ["durationMinutes", { durationMinutes: 4 }],
    ["durationMinutes", { durationMinutes: 485 }],
    ["priceCents", { priceCents: -1 }],
    ["priceCents", { priceCents: 1_000_001 }],
    ["description", { description: "x".repeat(501) }],
  ])(
    "rejects an invalid %s with 400 INVALID_DATA and a message in Portuguese",
    async (field, change) => {
      const shop = await shopWithCategory();
      const body = expectError(
        await create(shop.owner.auth, { ...valid(shop.categoryId), ...change }),
        400,
        "INVALID_DATA",
      );
      expect(body.fields?.[field]).toBeTypeOf("string");
      expect(await listAll(shop.owner.auth)).toEqual([]);
    },
  );

  it("explains the duration step in Portuguese", async () => {
    const shop = await shopWithCategory();
    const body = expectError(
      await create(shop.owner.auth, {
        ...valid(shop.categoryId),
        durationMinutes: 37,
      }),
      400,
      "INVALID_DATA",
    );
    expect(body.fields?.["durationMinutes"]).toContain("múltipla de 5");
  });

  it("a category that does not exist or belongs to another barbershop is an invalid field", async () => {
    const shop = await shopWithCategory();
    const other = await createCatalogShop(t);
    const foreign = await createCategory({ tenantId: other.tenantId });
    for (const categoryId of [NONEXISTENT, foreign]) {
      const body = expectError(
        await create(shop.owner.auth, valid(categoryId)),
        400,
        "INVALID_DATA",
      );
      expect(body.fields?.["categoryId"]).toBeTypeOf("string");
    }
  });

  it("a repeated name, ignoring case and spaces, answers 409 SERVICE_NAME_TAKEN", async () => {
    const shop = await shopWithCategory();
    await create(shop.owner.auth, valid(shop.categoryId, "Corte"));
    for (const name of ["corte", "Corte ", "  CORTE"]) {
      expectError(
        await create(shop.owner.auth, valid(shop.categoryId, name)),
        409,
        "SERVICE_NAME_TAKEN",
      );
    }
    expect(await listAll(shop.owner.auth)).toHaveLength(1);
  });

  it("the same name in another barbershop is accepted", async () => {
    const a = await shopWithCategory();
    const b = await shopWithCategory();
    expect((await create(a.owner.auth, valid(a.categoryId))).status).toBe(201);
    expect((await create(b.owner.auth, valid(b.categoryId))).status).toBe(201);
  });

  it("two simultaneous creations of the same name leave one service and one refusal", async () => {
    const shop = await shopWithCategory();
    const results = await Promise.all([
      create(shop.owner.auth, valid(shop.categoryId, "Barba")),
      create(shop.owner.auth, valid(shop.categoryId, "barba")),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await listAll(shop.owner.auth)).toHaveLength(1);
  });

  it("edits only the fields sent", async () => {
    const shop = await shopWithCategory();
    const created = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId))).body,
    );
    const response = await t
      .http()
      .patch(`/services/${created.id}`)
      .set(shop.owner.auth)
      .send({ priceCents: 5500 });
    expect(response.status).toBe(200);
    expect(Service.parse(response.body)).toMatchObject({
      name: "Corte",
      priceCents: 5500,
      durationMinutes: 30,
    });
  });

  it("description null clears the description", async () => {
    const shop = await shopWithCategory();
    const created = Service.parse(
      (
        await create(shop.owner.auth, {
          ...valid(shop.categoryId),
          description: "Antiga",
        })
      ).body,
    );
    const response = await t
      .http()
      .patch(`/services/${created.id}`)
      .set(shop.owner.auth)
      .send({ description: null });
    expect(Service.parse(response.body).description).toBeNull();
  });

  it("moves a service to another category of the same barbershop", async () => {
    const shop = await shopWithCategory();
    const other = await createCategory({
      tenantId: shop.tenantId,
      name: "Barba",
    });
    const created = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId))).body,
    );
    const response = await t
      .http()
      .patch(`/services/${created.id}`)
      .set(shop.owner.auth)
      .send({ categoryId: other });
    expect(Service.parse(response.body).categoryId).toBe(other);
  });

  it("an edit with invalid data or a taken name changes nothing", async () => {
    const shop = await shopWithCategory();
    const one = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId, "Corte"))).body,
    );
    await create(shop.owner.auth, valid(shop.categoryId, "Barba"));
    expectError(
      await t
        .http()
        .patch(`/services/${one.id}`)
        .set(shop.owner.auth)
        .send({ durationMinutes: 37 }),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t.http().patch(`/services/${one.id}`).set(shop.owner.auth).send({}),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t
        .http()
        .patch(`/services/${one.id}`)
        .set(shop.owner.auth)
        .send({ name: " barba" }),
      409,
      "SERVICE_NAME_TAKEN",
    );
    const after = (await listAll(shop.owner.auth)).find((s) => s.id === one.id);
    expect(after).toMatchObject({ name: "Corte", durationMinutes: 30 });
  });

  it("lists the services ordered by category position and then by name", async () => {
    const shop = await createCatalogShop(t);
    const second = await createCategory({
      tenantId: shop.tenantId,
      name: "Barba",
      position: 1,
    });
    const first = await createCategory({
      tenantId: shop.tenantId,
      name: "Cabelo",
      position: 0,
    });
    await createService({
      tenantId: shop.tenantId,
      categoryId: second,
      name: "Aparar",
    });
    await createService({
      tenantId: shop.tenantId,
      categoryId: first,
      name: "Zero",
    });
    await createService({
      tenantId: shop.tenantId,
      categoryId: first,
      name: "Alisar",
    });
    expect((await listAll(shop.owner.auth)).map((s) => s.name)).toEqual([
      "Alisar",
      "Zero",
      "Aparar",
    ]);
  });

  it("GET /services/{id} returns the service; another barbershop's id or a malformed one is 404", async () => {
    const shop = await shopWithCategory();
    const other = await shopWithCategory();
    const id = await createService({
      tenantId: other.tenantId,
      categoryId: other.categoryId,
    });
    const mine = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId))).body,
    );
    const found = await t
      .http()
      .get(`/services/${mine.id}`)
      .set(shop.owner.auth);
    expect(found.status).toBe(200);
    for (const target of [id, NONEXISTENT, "not-an-id"]) {
      expectError(
        await t.http().get(`/services/${target}`).set(shop.owner.auth),
        404,
        "NOT_FOUND",
      );
      expectError(
        await t
          .http()
          .patch(`/services/${target}`)
          .set(shop.owner.auth)
          .send({ priceCents: 1 }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("a barber and a visitor cannot create or edit", async () => {
    const shop = await shopWithCategory();
    const created = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId))).body,
    );
    expectError(
      await create(shop.barber.auth, valid(shop.categoryId, "Outro")),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t
        .http()
        .patch(`/services/${created.id}`)
        .set(shop.barber.auth)
        .send({ priceCents: 1 }),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().post("/services").send(valid(shop.categoryId)),
      401,
      "INVALID_SESSION",
    );
    expectError(await t.http().get("/services"), 401, "INVALID_SESSION");
    expect((await listAll(shop.owner.auth)).map((s) => s.name)).toEqual([
      "Corte",
    ]);
  });

  it("records service_created and service_updated with the before and after of price and duration", async () => {
    const shop = await shopWithCategory();
    const created = Service.parse(
      (await create(shop.owner.auth, valid(shop.categoryId))).body,
    );
    await t
      .http()
      .patch(`/services/${created.id}`)
      .set(shop.owner.auth)
      .send({ priceCents: 5500, durationMinutes: 45, description: "Nova" });
    const events = await catalogEventsOf(shop.tenantId);
    expect(events.map((e) => e.type)).toEqual([
      "service_created",
      "service_updated",
    ]);
    expect(
      events.every(
        (e) => e.actorUserId === shop.owner.id && e.serviceId === created.id,
      ),
    ).toBe(true);
    expect(events[1]?.details).toMatchObject({
      fields: expect.arrayContaining([
        "priceCents",
        "durationMinutes",
        "description",
      ]) as string[],
      price: { from: 5000, to: 5500 },
      duration: { from: 30, to: 45 },
    });
    expect(JSON.stringify(events.map((e) => e.details))).not.toMatch(
      /Dona Ana|example\.com/,
    );
  });
});
