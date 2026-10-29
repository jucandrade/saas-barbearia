import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PublicIdentity } from "@barbearia/contracts";
import { createApp, type TestApp } from "../helpers/app.js";
import { createBrandingShop, type BrandingShop } from "../helpers/branding.js";
import {
  expectError,
  expectRoutesCovered,
  successStatus,
} from "../helpers/contract.js";
import { closeConnections } from "../helpers/db.js";
import { png } from "../helpers/images.js";

const covered = new Set<string>();

describe("contract: public identity (no login)", () => {
  let t: TestApp;
  let shop: BrandingShop;
  let plain: BrandingShop;

  beforeAll(async () => {
    // A low limit so the 429 of the contract can be reached.
    t = await createApp({ limitPerMinute: 8 });
    shop = await createBrandingShop(t, "Contract Public");
    plain = await createBrandingShop(t, "Contract Public Plain");
    await t
      .http()
      .put("/branding/logo")
      .set(shop.owner.auth)
      .set("Content-Type", "image/png")
      .send(png(200, 200));
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("GET /public/barbershops/{slug}/identity: 200 PublicIdentity, with no session", async () => {
    covered.add("get /public/barbershops/{slug}/identity");
    const ok = await t.http().get(`/public/barbershops/${shop.slug}/identity`);
    expect(ok.status).toBe(
      successStatus("get", "/public/barbershops/{slug}/identity"),
    );
    expect(PublicIdentity.parse(ok.body).name).toBe(shop.name);

    // An unknown link is not an error: it answers the product default.
    const unknown = await t
      .http()
      .get("/public/barbershops/nao-existe-mesmo/identity");
    expect(unknown.status).toBe(200);
    expect(PublicIdentity.parse(unknown.body).name).toBeNull();
  });

  it("GET /public/barbershops/{slug}/logo: 200 image, 404 in the error format", async () => {
    covered.add("get /public/barbershops/{slug}/logo");
    const ok = await t.http().get(`/public/barbershops/${shop.slug}/logo`);
    expect(ok.status).toBe(
      successStatus("get", "/public/barbershops/{slug}/logo"),
    );
    expect(["image/png", "image/jpeg", "image/webp"]).toContain(
      (ok.headers["content-type"] ?? "").split(";")[0],
    );
    expectError(
      await t.http().get(`/public/barbershops/${plain.slug}/logo`),
      404,
      "NOT_FOUND",
    );
  });

  it("answers 429 TOO_MANY_REQUESTS in the error format when the origin goes over the limit", async () => {
    let limited: { status: number; body: unknown; text: string } | undefined;
    for (let call = 0; call < 12 && limited === undefined; call += 1) {
      const response = await t
        .http()
        .get(`/public/barbershops/${shop.slug}/identity`);
      if (response.status === 429) limited = response;
    }
    expect(limited).toBeDefined();
    if (limited !== undefined) {
      expectError(limited, 429, "TOO_MANY_REQUESTS");
    }
  });

  it("covers the public routes of the registry", () => {
    expectRoutesCovered(
      [
        "get /public/barbershops/{slug}/identity",
        "get /public/barbershops/{slug}/logo",
      ],
      covered,
    );
  });
});
