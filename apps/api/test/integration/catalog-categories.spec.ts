import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CategoriesOutput, ServiceCategory } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  NONEXISTENT,
  catalogEventsOf,
  createCatalogShop,
} from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections } from "./helpers/db.js";
import { createCategory, createService } from "./helpers/factory.js";

describe("catalog categories", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function createByApi(auth: { Authorization: string }, name: string) {
    const response = await t
      .http()
      .post("/service-categories")
      .set(auth)
      .send({ name });
    expect(response.status).toBe(201);
    return ServiceCategory.parse(response.body);
  }

  const list = async (auth: { Authorization: string }) =>
    CategoriesOutput.parse(
      (await t.http().get("/service-categories").set(auth)).body,
    ).categories;

  it("the owner creates categories and each goes to the end of the order", async () => {
    const shop = await createCatalogShop(t);
    const hair = await createByApi(shop.owner.auth, "Cabelo");
    const beard = await createByApi(shop.owner.auth, "Barba");
    expect(hair.name).toBe("Cabelo");
    expect(beard.position).toBeGreaterThan(hair.position);
    expect((await list(shop.owner.auth)).map((c) => c.name)).toEqual([
      "Cabelo",
      "Barba",
    ]);
  });

  it("a repeated name, ignoring case and spaces, answers 409 CATEGORY_NAME_TAKEN", async () => {
    const shop = await createCatalogShop(t);
    await createByApi(shop.owner.auth, "Cabelo");
    for (const name of ["cabelo", "  CABELO ", "Cabelo"]) {
      expectError(
        await t
          .http()
          .post("/service-categories")
          .set(shop.owner.auth)
          .send({ name }),
        409,
        "CATEGORY_NAME_TAKEN",
      );
    }
    expect(await list(shop.owner.auth)).toHaveLength(1);
  });

  it("the same name in another barbershop is accepted", async () => {
    const a = await createCatalogShop(t);
    const b = await createCatalogShop(t);
    await createByApi(a.owner.auth, "Cabelo");
    await createByApi(b.owner.auth, "Cabelo");
  });

  it("an invalid name answers 400 INVALID_DATA pointing at the field", async () => {
    const shop = await createCatalogShop(t);
    for (const name of ["", "   ", "a".repeat(81)]) {
      const body = expectError(
        await t
          .http()
          .post("/service-categories")
          .set(shop.owner.auth)
          .send({ name }),
        400,
        "INVALID_DATA",
      );
      expect(body.fields?.["name"]).toBeTypeOf("string");
    }
  });

  it("renames a category without touching its services", async () => {
    const shop = await createCatalogShop(t);
    const category = await createByApi(shop.owner.auth, "Cabelo");
    const serviceId = await createService({
      tenantId: shop.tenantId,
      categoryId: category.id,
    });
    const response = await t
      .http()
      .patch(`/service-categories/${category.id}`)
      .set(shop.owner.auth)
      .send({ name: "Cabelos" });
    expect(response.status).toBe(200);
    expect(ServiceCategory.parse(response.body)).toMatchObject({
      id: category.id,
      name: "Cabelos",
    });
    const services = await t.http().get("/services").set(shop.owner.auth);
    const found = (
      services.body as { services: { id: string; categoryId: string }[] }
    ).services.find((s) => s.id === serviceId);
    expect(found?.categoryId).toBe(category.id);
  });

  it("renaming only the case of its own name works; taking another's name does not", async () => {
    const shop = await createCatalogShop(t);
    const hair = await createByApi(shop.owner.auth, "Cabelo");
    await createByApi(shop.owner.auth, "Barba");
    const same = await t
      .http()
      .patch(`/service-categories/${hair.id}`)
      .set(shop.owner.auth)
      .send({ name: "CABELO" });
    expect(same.status).toBe(200);
    expectError(
      await t
        .http()
        .patch(`/service-categories/${hair.id}`)
        .set(shop.owner.auth)
        .send({ name: " barba " }),
      409,
      "CATEGORY_NAME_TAKEN",
    );
  });

  it("renaming an unknown or malformed id answers 404", async () => {
    const shop = await createCatalogShop(t);
    for (const id of [NONEXISTENT, "not-an-id"]) {
      expectError(
        await t
          .http()
          .patch(`/service-categories/${id}`)
          .set(shop.owner.auth)
          .send({ name: "X" }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("reorders with the complete list and rejects lists that are not the exact set", async () => {
    const shop = await createCatalogShop(t);
    const a = await createByApi(shop.owner.auth, "A");
    const b = await createByApi(shop.owner.auth, "B");
    const c = await createByApi(shop.owner.auth, "C");

    const ok = await t
      .http()
      .put("/service-categories/order")
      .set(shop.owner.auth)
      .send({ ids: [c.id, a.id, b.id] });
    expect(ok.status).toBe(204);
    expect((await list(shop.owner.auth)).map((x) => x.name)).toEqual([
      "C",
      "A",
      "B",
    ]);

    const other = await createCatalogShop(t);
    const foreign = await createByApi(other.owner.auth, "Foreign");
    for (const ids of [
      [a.id, b.id],
      [a.id, b.id, c.id, c.id],
      [a.id, b.id, c.id, NONEXISTENT],
      [a.id, b.id, foreign.id],
      [],
    ]) {
      expectError(
        await t
          .http()
          .put("/service-categories/order")
          .set(shop.owner.auth)
          .send({ ids }),
        400,
        "INVALID_ORDER",
      );
    }
    expect((await list(shop.owner.auth)).map((x) => x.name)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("removes an empty category", async () => {
    const shop = await createCatalogShop(t);
    const category = await createByApi(shop.owner.auth, "Vazia");
    const response = await t
      .http()
      .delete(`/service-categories/${category.id}`)
      .set(shop.owner.auth);
    expect(response.status).toBe(204);
    expect(await list(shop.owner.auth)).toEqual([]);
  });

  it("refuses to remove a category that has an active or a deactivated service", async () => {
    const shop = await createCatalogShop(t);
    const withActive = await createCategory({ tenantId: shop.tenantId });
    await createService({ tenantId: shop.tenantId, categoryId: withActive });
    const withDeactivated = await createCategory({ tenantId: shop.tenantId });
    await createService({
      tenantId: shop.tenantId,
      categoryId: withDeactivated,
      status: "deactivated",
    });
    for (const id of [withActive, withDeactivated]) {
      expectError(
        await t.http().delete(`/service-categories/${id}`).set(shop.owner.auth),
        409,
        "CATEGORY_NOT_EMPTY",
      );
    }
  });

  it("removing an unknown category answers 404", async () => {
    const shop = await createCatalogShop(t);
    expectError(
      await t
        .http()
        .delete(`/service-categories/${NONEXISTENT}`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
  });

  it("a barber reads the list but gets 403 NO_PERMISSION on every write", async () => {
    const shop = await createCatalogShop(t);
    const category = await createByApi(shop.owner.auth, "Cabelo");
    expect(await list(shop.barber.auth)).toHaveLength(1);
    const attempts = [
      () =>
        t
          .http()
          .post("/service-categories")
          .set(shop.barber.auth)
          .send({ name: "X" }),
      () =>
        t
          .http()
          .patch(`/service-categories/${category.id}`)
          .set(shop.barber.auth)
          .send({ name: "X" }),
      () =>
        t
          .http()
          .put("/service-categories/order")
          .set(shop.barber.auth)
          .send({ ids: [category.id] }),
      () =>
        t
          .http()
          .delete(`/service-categories/${category.id}`)
          .set(shop.barber.auth),
    ];
    for (const attempt of attempts) {
      expectError(await attempt(), 403, "NO_PERMISSION");
    }
    expect(await list(shop.owner.auth)).toHaveLength(1);
  });

  it("without a session every route answers 401 INVALID_SESSION", async () => {
    for (const response of [
      await t.http().get("/service-categories"),
      await t.http().post("/service-categories").send({ name: "X" }),
      await t.http().put("/service-categories/order").send({ ids: [] }),
      await t.http().delete(`/service-categories/${NONEXISTENT}`),
    ]) {
      expectError(response, 401, "INVALID_SESSION");
    }
  });

  it("records one event per operation, with the author and no personal data", async () => {
    const shop = await createCatalogShop(t);
    const a = await createByApi(shop.owner.auth, "A");
    const b = await createByApi(shop.owner.auth, "B");
    await t
      .http()
      .patch(`/service-categories/${a.id}`)
      .set(shop.owner.auth)
      .send({ name: "A2" });
    await t
      .http()
      .put("/service-categories/order")
      .set(shop.owner.auth)
      .send({ ids: [b.id, a.id] });
    await t.http().delete(`/service-categories/${b.id}`).set(shop.owner.auth);

    const events = await catalogEventsOf(shop.tenantId);
    expect(events.map((e) => e.type)).toEqual([
      "category_created",
      "category_created",
      "category_renamed",
      "categories_reordered",
      "category_deleted",
    ]);
    expect(events.every((e) => e.actorUserId === shop.owner.id)).toBe(true);
    expect(events[2]?.categoryId).toBe(a.id);
    expect(JSON.stringify(events.map((e) => e.details))).not.toMatch(
      /Dona Ana|example\.com/,
    );
  });
});
