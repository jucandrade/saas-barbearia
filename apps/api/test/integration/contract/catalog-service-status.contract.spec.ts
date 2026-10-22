import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("contract: deactivate and reactivate a service", () => {
  let t: TestApp;
  let shop: CatalogShop;
  let serviceId: string;

  beforeAll(async () => {
    t = await createApp();
    shop = await createCatalogShop(t, "Contract Status");
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    serviceId = await createService({ tenantId: shop.tenantId, categoryId });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("POST /services/{id}/deactivate: 204 without a body, 404, 403, 401", async () => {
    covered.add("post /services/{id}/deactivate");
    const ok = await t
      .http()
      .post(`/services/${serviceId}/deactivate`)
      .set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("post", "/services/{id}/deactivate"));
    expect(ok.text).toBe("");

    expectError(
      await t
        .http()
        .post(`/services/${NONEXISTENT}/deactivate`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .post(`/services/${serviceId}/deactivate`)
        .set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().post(`/services/${serviceId}/deactivate`),
      401,
      "INVALID_SESSION",
    );
  });

  it("POST /services/{id}/reactivate: 204 without a body, 404, 403, 401", async () => {
    covered.add("post /services/{id}/reactivate");
    const ok = await t
      .http()
      .post(`/services/${serviceId}/reactivate`)
      .set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("post", "/services/{id}/reactivate"));
    expect(ok.text).toBe("");

    expectError(
      await t
        .http()
        .post(`/services/${NONEXISTENT}/reactivate`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .post(`/services/${serviceId}/reactivate`)
        .set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().post(`/services/${serviceId}/reactivate`),
      401,
      "INVALID_SESSION",
    );
  });

  it("covers both status routes of the registry", () => {
    expectRoutesCovered(
      ["post /services/{id}/deactivate", "post /services/{id}/reactivate"],
      covered,
    );
  });
});
