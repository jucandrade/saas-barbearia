import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Executor, ExecutorsOutput } from "@barbearia/contracts";
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
  createUser,
} from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: service executors", () => {
  let t: TestApp;
  let shop: CatalogShop;
  let serviceId: string;

  beforeAll(async () => {
    t = await createApp();
    shop = await createCatalogShop(t, "Contract Executors");
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    serviceId = await createService({ tenantId: shop.tenantId, categoryId });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("PUT /services/{id}/executors/{userId}: 200 Executor, 400, 403, 404, 409 EXECUTOR_NOT_ELIGIBLE, 401", async () => {
    covered.add("put /services/{id}/executors/{userId}");
    const ok = await t
      .http()
      .put(`/services/${serviceId}/executors/${shop.barber.id}`)
      .set(shop.owner.auth)
      .send({ priceCents: 6000 });
    expect(ok.status).toBe(
      successStatus("put", "/services/{id}/executors/{userId}"),
    );
    expect(Executor.parse(ok.body)).toMatchObject({
      userId: shop.barber.id,
      priceCents: 6000,
      durationMinutes: null,
    });

    const invalid = expectError(
      await t
        .http()
        .put(`/services/${serviceId}/executors/${shop.barber.id}`)
        .set(shop.owner.auth)
        .send({ durationMinutes: 37 }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {})).toEqual(["durationMinutes"]);

    const invited = await createUser({
      tenantId: shop.tenantId,
      status: "invited",
    });
    expectError(
      await t
        .http()
        .put(`/services/${serviceId}/executors/${invited}`)
        .set(shop.owner.auth)
        .send({}),
      409,
      "EXECUTOR_NOT_ELIGIBLE",
    );
    expectError(
      await t
        .http()
        .put(`/services/${serviceId}/executors/${NONEXISTENT}`)
        .set(shop.owner.auth)
        .send({}),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .put(`/services/${serviceId}/executors/${shop.barber.id}`)
        .set(shop.barber.auth)
        .send({}),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t
        .http()
        .put(`/services/${serviceId}/executors/${shop.barber.id}`)
        .send({}),
      401,
      "INVALID_SESSION",
    );
  });

  it("GET /services/{id}/executors: 200 ExecutorsOutput, 404, 401", async () => {
    covered.add("get /services/{id}/executors");
    const ok = await t
      .http()
      .get(`/services/${serviceId}/executors`)
      .set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("get", "/services/{id}/executors"));
    expect(ExecutorsOutput.parse(ok.body).executors).toHaveLength(1);
    expectError(
      await t
        .http()
        .get(`/services/${NONEXISTENT}/executors`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().get(`/services/${serviceId}/executors`),
      401,
      "INVALID_SESSION",
    );
  });

  it("DELETE /services/{id}/executors/{userId}: 204 without a body, 404, 403, 401", async () => {
    covered.add("delete /services/{id}/executors/{userId}");
    const ok = await t
      .http()
      .delete(`/services/${serviceId}/executors/${shop.barber.id}`)
      .set(shop.owner.auth);
    expect(ok.status).toBe(
      successStatus("delete", "/services/{id}/executors/{userId}"),
    );
    expect(ok.text).toBe("");
    expectError(
      await t
        .http()
        .delete(`/services/${NONEXISTENT}/executors/${shop.barber.id}`)
        .set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .delete(`/services/${serviceId}/executors/${shop.barber.id}`)
        .set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t
        .http()
        .delete(`/services/${serviceId}/executors/${shop.barber.id}`),
      401,
      "INVALID_SESSION",
    );
  });

  it("covers the three executor routes of the registry", () => {
    expectRoutesCovered(
      [
        "get /services/{id}/executors",
        "put /services/{id}/executors/{userId}",
        "delete /services/{id}/executors/{userId}",
      ],
      covered,
    );
  });
});
