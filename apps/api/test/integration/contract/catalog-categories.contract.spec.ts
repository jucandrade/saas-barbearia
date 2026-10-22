import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CategoriesOutput, ServiceCategory } from "@barbearia/contracts";
import { createApp, type TestApp } from "../helpers/app.js";
import {
  NONEXISTENT,
  createCatalogShop,
  type CatalogShop,
} from "../helpers/catalog.js";
import {
  expectError,
  expectRoutesCovered,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import { createCategory, createService } from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: service categories", () => {
  let t: TestApp;
  let shop: CatalogShop;

  beforeAll(async () => {
    t = await createApp();
    shop = await createCatalogShop(t, "Contract Categories");
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("GET /service-categories: 200 CategoriesOutput, 401 without a session", async () => {
    covered.add("get /service-categories");
    const ok = await t.http().get("/service-categories").set(shop.barber.auth);
    expect(ok.status).toBe(successStatus("get", "/service-categories"));
    CategoriesOutput.parse(ok.body);
    expectError(
      await t.http().get("/service-categories"),
      401,
      "INVALID_SESSION",
    );
  });

  it("POST /service-categories: 201 ServiceCategory, 409 CATEGORY_NAME_TAKEN, 400 INVALID_DATA, 403", async () => {
    covered.add("post /service-categories");
    const ok = await t
      .http()
      .post("/service-categories")
      .set(shop.owner.auth)
      .send({ name: "Cabelo" });
    expect(ok.status).toBe(successStatus("post", "/service-categories"));
    ServiceCategory.parse(ok.body);

    expectError(
      await t
        .http()
        .post("/service-categories")
        .set(shop.owner.auth)
        .send({ name: "cabelo" }),
      409,
      "CATEGORY_NAME_TAKEN",
    );
    const invalid = expectError(
      await t
        .http()
        .post("/service-categories")
        .set(shop.owner.auth)
        .send({ name: "" }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {})).toEqual(["name"]);
    expectError(
      await t
        .http()
        .post("/service-categories")
        .set(shop.barber.auth)
        .send({ name: "X" }),
      403,
      "NO_PERMISSION",
    );
  });

  it("PATCH /service-categories/{id}: 200 ServiceCategory, 404, 409, 400", async () => {
    covered.add("patch /service-categories/{id}");
    const id = ServiceCategory.parse(
      (
        await t
          .http()
          .post("/service-categories")
          .set(shop.owner.auth)
          .send({ name: "Barba" })
      ).body,
    ).id;
    const ok = await t
      .http()
      .patch(`/service-categories/${id}`)
      .set(shop.owner.auth)
      .send({ name: "Barbas" });
    expect(ok.status).toBe(successStatus("patch", "/service-categories/{id}"));
    expect(ServiceCategory.parse(ok.body).name).toBe("Barbas");

    expectError(
      await t
        .http()
        .patch(`/service-categories/${NONEXISTENT}`)
        .set(shop.owner.auth)
        .send({ name: "Y" }),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .patch(`/service-categories/${id}`)
        .set(shop.owner.auth)
        .send({ name: "Cabelo" }),
      409,
      "CATEGORY_NAME_TAKEN",
    );
    expectError(
      await t
        .http()
        .patch(`/service-categories/${id}`)
        .set(shop.owner.auth)
        .send({ name: "" }),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t
        .http()
        .patch(`/service-categories/${id}`)
        .set(shop.barber.auth)
        .send({ name: "Z" }),
      403,
      "NO_PERMISSION",
    );
  });

  it("PUT /service-categories/order: 204 without a body, 400 INVALID_ORDER, 400 INVALID_DATA", async () => {
    covered.add("put /service-categories/order");
    const ids = CategoriesOutput.parse(
      (await t.http().get("/service-categories").set(shop.owner.auth)).body,
    ).categories.map((c) => c.id);
    const ok = await t
      .http()
      .put("/service-categories/order")
      .set(shop.owner.auth)
      .send({ ids: [...ids].reverse() });
    expect(ok.status).toBe(successStatus("put", "/service-categories/order"));
    expect(ok.text).toBe("");

    expectError(
      await t
        .http()
        .put("/service-categories/order")
        .set(shop.owner.auth)
        .send({ ids: [ids[0]] }),
      400,
      "INVALID_ORDER",
    );
    expectError(
      await t
        .http()
        .put("/service-categories/order")
        .set(shop.owner.auth)
        .send({ ids: "x" }),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t
        .http()
        .put("/service-categories/order")
        .set(shop.barber.auth)
        .send({ ids }),
      403,
      "NO_PERMISSION",
    );
  });

  it("DELETE /service-categories/{id}: 204 without a body, 404, 409 CATEGORY_NOT_EMPTY", async () => {
    covered.add("delete /service-categories/{id}");
    const empty = await createCategory({
      tenantId: shop.tenantId,
      name: "Vazia",
    });
    const used = await createCategory({
      tenantId: shop.tenantId,
      name: "Usada",
    });
    await createService({ tenantId: shop.tenantId, categoryId: used });

    const ok = await t
      .http()
      .delete(`/service-categories/${empty}`)
      .set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("delete", "/service-categories/{id}"));
    expect(ok.text).toBe("");

    expectError(
      await t.http().delete(`/service-categories/${used}`).set(shop.owner.auth),
      409,
      "CATEGORY_NOT_EMPTY",
    );
    expectError(
      await t
        .http()
        .delete(`/service-categories/${NONEXISTENT}`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .delete(`/service-categories/${used}`)
        .set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
  });

  it("covers every category route of the registry", () => {
    expectRoutesCovered(
      [
        "get /service-categories",
        "post /service-categories",
        "patch /service-categories/{id}",
        "put /service-categories/order",
        "delete /service-categories/{id}",
      ],
      covered,
    );
  });
});
