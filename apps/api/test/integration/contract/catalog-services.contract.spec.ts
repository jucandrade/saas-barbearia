import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Service, ServicesOutput } from "@barbearia/contracts";
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
import { createCategory } from "../helpers/factory.js";

const covered = new Set<string>();

describe("contract: services", () => {
  let t: TestApp;
  let shop: CatalogShop;
  let categoryId: string;

  beforeAll(async () => {
    t = await createApp();
    shop = await createCatalogShop(t, "Contract Services");
    categoryId = await createCategory({
      tenantId: shop.tenantId,
      name: "Cabelo",
    });
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const body = (name: string) => ({
    name,
    categoryId,
    priceCents: 5000,
    durationMinutes: 30,
  });

  it("POST /services: 201 Service, 400 INVALID_DATA with fields, 409 SERVICE_NAME_TAKEN, 403, 401", async () => {
    covered.add("post /services");
    const ok = await t
      .http()
      .post("/services")
      .set(shop.owner.auth)
      .send(body("Corte"));
    expect(ok.status).toBe(successStatus("post", "/services"));
    Service.parse(ok.body);

    const invalid = expectError(
      await t
        .http()
        .post("/services")
        .set(shop.owner.auth)
        .send({ name: "", categoryId, priceCents: -1, durationMinutes: 37 }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {}).sort()).toEqual([
      "durationMinutes",
      "name",
      "priceCents",
    ]);
    expectError(
      await t
        .http()
        .post("/services")
        .set(shop.owner.auth)
        .send(body(" CORTE")),
      409,
      "SERVICE_NAME_TAKEN",
    );
    expectError(
      await t
        .http()
        .post("/services")
        .set(shop.barber.auth)
        .send(body("Outro")),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().post("/services").send(body("Outro")),
      401,
      "INVALID_SESSION",
    );
  });

  it("GET /services: 200 ServicesOutput for the owner and the barber, 401 without a session", async () => {
    covered.add("get /services");
    for (const who of [shop.owner, shop.barber]) {
      const ok = await t.http().get("/services").set(who.auth);
      expect(ok.status).toBe(successStatus("get", "/services"));
      expect(ServicesOutput.parse(ok.body).services.length).toBeGreaterThan(0);
    }
    const filtered = await t
      .http()
      .get("/services?status=deactivated")
      .set(shop.owner.auth);
    expect(ServicesOutput.parse(filtered.body).services).toEqual([]);
    expectError(
      await t.http().get("/services?status=bogus").set(shop.owner.auth),
      400,
      "INVALID_DATA",
    );
    expectError(await t.http().get("/services"), 401, "INVALID_SESSION");
  });

  it("GET /services/{id}: 200 Service, 404 NOT_FOUND, 401", async () => {
    covered.add("get /services/{id}");
    const id = ServicesOutput.parse(
      (await t.http().get("/services").set(shop.owner.auth)).body,
    ).services[0]?.id;
    const ok = await t
      .http()
      .get(`/services/${id ?? ""}`)
      .set(shop.barber.auth);
    expect(ok.status).toBe(successStatus("get", "/services/{id}"));
    Service.parse(ok.body);
    expectError(
      await t.http().get(`/services/${NONEXISTENT}`).set(shop.owner.auth),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t.http().get(`/services/${id ?? ""}`),
      401,
      "INVALID_SESSION",
    );
  });

  it("PATCH /services/{id}: 200 Service, 404, 400, 409, 403", async () => {
    covered.add("patch /services/{id}");
    const created = Service.parse(
      (
        await t
          .http()
          .post("/services")
          .set(shop.owner.auth)
          .send(body("Barba"))
      ).body,
    );
    const ok = await t
      .http()
      .patch(`/services/${created.id}`)
      .set(shop.owner.auth)
      .send({ priceCents: 4000, description: null });
    expect(ok.status).toBe(successStatus("patch", "/services/{id}"));
    expect(Service.parse(ok.body)).toMatchObject({
      priceCents: 4000,
      description: null,
    });

    expectError(
      await t
        .http()
        .patch(`/services/${NONEXISTENT}`)
        .set(shop.owner.auth)
        .send({ priceCents: 1 }),
      404,
      "NOT_FOUND",
    );
    expectError(
      await t
        .http()
        .patch(`/services/${created.id}`)
        .set(shop.owner.auth)
        .send({}),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t
        .http()
        .patch(`/services/${created.id}`)
        .set(shop.owner.auth)
        .send({ name: "corte" }),
      409,
      "SERVICE_NAME_TAKEN",
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
  });

  it("covers the service routes of this story", () => {
    expectRoutesCovered(
      [
        "post /services",
        "get /services",
        "get /services/{id}",
        "patch /services/{id}",
      ],
      covered,
    );
  });
});
