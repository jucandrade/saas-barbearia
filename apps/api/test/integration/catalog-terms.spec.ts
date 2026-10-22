import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TermsOutput } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  NONEXISTENT,
  catalogEventsOf,
  createCatalogShop,
  type CatalogShop,
} from "./helpers/catalog.js";
import { expectError } from "./helpers/contract.js";
import { closeConnections } from "./helpers/db.js";
import { TenantDb } from "../../src/db/tenant-db.js";
import { CatalogFacade } from "../../src/catalog/catalog.facade.js";
import {
  createCategory,
  createService,
  linkExecutor,
} from "./helpers/factory.js";

describe("catalog terms: price and duration that apply to an executor", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function scenario(status: "active" | "deactivated" = "active") {
    const shop: CatalogShop = await createCatalogShop(t);
    const categoryId = await createCategory({ tenantId: shop.tenantId });
    const serviceId = await createService({
      tenantId: shop.tenantId,
      categoryId,
      priceCents: 5000,
      durationMinutes: 30,
      status,
    });
    return { shop, serviceId };
  }

  const termsOf = (
    auth: { Authorization: string },
    serviceId: string,
    userId: string,
  ) => t.http().get(`/services/${serviceId}/terms`).query({ userId }).set(auth);

  const put = (
    auth: { Authorization: string },
    serviceId: string,
    userId: string,
    body: object,
  ) =>
    t
      .http()
      .put(`/services/${serviceId}/executors/${userId}`)
      .set(auth)
      .send(body);

  it("uses the service defaults when the executor has no specific values", async () => {
    const { shop, serviceId } = await scenario();
    await linkExecutor({
      tenantId: shop.tenantId,
      serviceId,
      userId: shop.barber.id,
    });
    const response = await termsOf(shop.owner.auth, serviceId, shop.barber.id);
    expect(response.status).toBe(200);
    expect(TermsOutput.parse(response.body)).toEqual({
      priceCents: 5000,
      durationMinutes: 30,
      priceSource: "service",
      durationSource: "service",
    });
  });

  it("resolves price and duration independently", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toEqual({
      priceCents: 6000,
      durationMinutes: 30,
      priceSource: "executor",
      durationSource: "service",
    });

    await put(shop.owner.auth, serviceId, shop.barber.id, {
      durationMinutes: 45,
    });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toEqual({
      priceCents: 6000,
      durationMinutes: 45,
      priceSource: "executor",
      durationSource: "executor",
    });
  });

  it("a specific price of zero is a real value", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 0 });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toMatchObject({ priceCents: 0, priceSource: "executor" });
  });

  it("other executors keep the default when only one has specific values", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    await put(shop.owner.auth, serviceId, shop.owner.id, {});
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.owner.id)).body,
      ),
    ).toMatchObject({ priceCents: 5000, priceSource: "service" });
  });

  it("changing the service default does not touch the specific value", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    await put(shop.owner.auth, serviceId, shop.owner.id, {});
    await t
      .http()
      .patch(`/services/${serviceId}`)
      .set(shop.owner.auth)
      .send({ priceCents: 5500 });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toMatchObject({ priceCents: 6000, priceSource: "executor" });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.owner.id)).body,
      ),
    ).toMatchObject({ priceCents: 5500, priceSource: "service" });
  });

  it("null goes back to the default; an empty body or a missing field changes nothing", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, {
      priceCents: 6000,
      durationMinutes: 45,
    });
    await put(shop.owner.auth, serviceId, shop.barber.id, {});
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toMatchObject({ priceCents: 6000, durationMinutes: 45 });

    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: null });
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toEqual({
      priceCents: 5000,
      durationMinutes: 45,
      priceSource: "service",
      durationSource: "executor",
    });
  });

  it("an invalid specific value is refused and the previous one stays", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    for (const body of [
      { durationMinutes: 37 },
      { durationMinutes: 600 },
      { priceCents: -1 },
      { priceCents: 1_000_001 },
    ]) {
      expectError(
        await put(shop.owner.auth, serviceId, shop.barber.id, body),
        400,
        "INVALID_DATA",
      );
    }
    expect(
      TermsOutput.parse(
        (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
      ),
    ).toMatchObject({ priceCents: 6000 });
  });

  it("records executor_updated with the values before and after", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6000 });
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6500 });
    await put(shop.owner.auth, serviceId, shop.barber.id, { priceCents: 6500 });
    const events = await catalogEventsOf(shop.tenantId);
    expect(events.map((e) => e.type)).toEqual([
      "executor_linked",
      "executor_updated",
    ]);
    expect(events[1]?.details).toMatchObject({
      price: { from: 6000, to: 6500 },
    });
  });

  it("the facade answers the same as the endpoint", async () => {
    const { shop, serviceId } = await scenario();
    await put(shop.owner.auth, serviceId, shop.barber.id, {
      priceCents: 6000,
      durationMinutes: 45,
    });
    const viaFacade = await t.app
      .get(TenantDb)
      .transaction(shop.tenantId, (tx) =>
        t.app.get(CatalogFacade).resolveTerms(tx, serviceId, shop.barber.id),
      );
    const viaHttp = TermsOutput.parse(
      (await termsOf(shop.owner.auth, serviceId, shop.barber.id)).body,
    );
    expect(viaFacade).toEqual(viaHttp);

    const nobody = await t.app
      .get(TenantDb)
      .transaction(shop.tenantId, (tx) =>
        t.app.get(CatalogFacade).resolveTerms(tx, serviceId, shop.owner.id),
      );
    expect(nobody).toBeUndefined();
  });

  it("answers 404 for someone who is not an active executor, an unknown service and another barbershop", async () => {
    const { shop, serviceId } = await scenario();
    const other = await scenario();
    await linkExecutor({
      tenantId: shop.tenantId,
      serviceId,
      userId: shop.barber.id,
    });
    expectError(
      await termsOf(shop.owner.auth, serviceId, shop.owner.id),
      404,
      "NOT_FOUND",
    );
    expectError(
      await termsOf(shop.owner.auth, NONEXISTENT, shop.barber.id),
      404,
      "NOT_FOUND",
    );
    expectError(
      await termsOf(shop.owner.auth, other.serviceId, other.shop.barber.id),
      404,
      "NOT_FOUND",
    );
    await t
      .http()
      .post(`/team/${shop.barber.id}/deactivate`)
      .set(shop.owner.auth);
    expectError(
      await termsOf(shop.owner.auth, serviceId, shop.barber.id),
      404,
      "NOT_FOUND",
    );
  });

  it("needs the userId query", async () => {
    const { shop, serviceId } = await scenario();
    expectError(
      await t.http().get(`/services/${serviceId}/terms`).set(shop.owner.auth),
      400,
      "INVALID_DATA",
    );
    expectError(
      await t
        .http()
        .get(`/services/${serviceId}/terms`)
        .query({ userId: "x" })
        .set(shop.owner.auth),
      400,
      "INVALID_DATA",
    );
  });

  it("a barber can ask for any executor; for a deactivated service only the owner can", async () => {
    const live = await scenario();
    await linkExecutor({
      tenantId: live.shop.tenantId,
      serviceId: live.serviceId,
      userId: live.shop.barber.id,
      priceCents: 6000,
    });
    expect(
      (
        await termsOf(
          live.shop.barber.auth,
          live.serviceId,
          live.shop.barber.id,
        )
      ).status,
    ).toBe(200);

    const off = await scenario("deactivated");
    await linkExecutor({
      tenantId: off.shop.tenantId,
      serviceId: off.serviceId,
      userId: off.shop.barber.id,
    });
    expectError(
      await termsOf(off.shop.barber.auth, off.serviceId, off.shop.barber.id),
      404,
      "NOT_FOUND",
    );
    expect(
      (await termsOf(off.shop.owner.auth, off.serviceId, off.shop.barber.id))
        .status,
    ).toBe(200);
  });

  it("a visitor gets 401", async () => {
    const { shop, serviceId } = await scenario();
    expectError(
      await t
        .http()
        .get(`/services/${serviceId}/terms`)
        .query({ userId: shop.barber.id }),
      401,
      "INVALID_SESSION",
    );
  });
});
