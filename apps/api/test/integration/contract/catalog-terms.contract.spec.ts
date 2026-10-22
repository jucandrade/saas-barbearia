import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TermsOutput } from "@barbearia/contracts";
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
import {
  createCategory,
  createService,
  linkExecutor,
} from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: terms of a service for an executor", () => {
  let t: TestApp;
  let shop: CatalogShop;
  let serviceId: string;

  beforeAll(async () => {
    t = await createApp();
    shop = await createCatalogShop(t, "Contract Terms");
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    serviceId = await createService({ tenantId: shop.tenantId, categoryId });
    await linkExecutor({
      tenantId: shop.tenantId,
      serviceId,
      userId: shop.barber.id,
      priceCents: 6000,
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("GET /services/{id}/terms: 200 TermsOutput, 400 INVALID_DATA, 404 NOT_FOUND, 401", async () => {
    covered.add("get /services/{id}/terms");
    const ok = await t
      .http()
      .get(`/services/${serviceId}/terms`)
      .query({ userId: shop.barber.id })
      .set(shop.barber.auth);
    expect(ok.status).toBe(successStatus("get", "/services/{id}/terms"));
    expect(TermsOutput.parse(ok.body)).toMatchObject({
      priceCents: 6000,
      priceSource: "executor",
      durationSource: "service",
    });

    const invalid = expectError(
      await t.http().get(`/services/${serviceId}/terms`).set(shop.owner.auth),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {})).toEqual(["userId"]);
    expectError(
      await t
        .http()
        .get(`/services/${NONEXISTENT}/terms`)
        .query({ userId: shop.barber.id })
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .get(`/services/${serviceId}/terms`)
        .query({ userId: shop.barber.id }),
      401,
      "INVALID_SESSION",
    );
  });

  it("covers the terms route of the registry", () => {
    expectRoutesCovered(["get /services/{id}/terms"], covered);
  });
});
