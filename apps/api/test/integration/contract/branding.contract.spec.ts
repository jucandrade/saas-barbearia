import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Branding } from "@barbearia/contracts";
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

const valid = {
  name: "Barbearia do Billy",
  theme: "day",
  primaryTone: "blue",
  accentTone: "gold",
};

describe("contract: branding", () => {
  let t: TestApp;
  let shop: BrandingShop;

  beforeAll(async () => {
    t = await createApp();
    shop = await createBrandingShop(t, "Contract Branding");
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("GET /branding: 200 Branding for any signed-in user, 401 without a session", async () => {
    covered.add("get /branding");
    for (const actor of [shop.owner, shop.barber]) {
      const ok = await t.http().get("/branding").set(actor.auth);
      expect(ok.status).toBe(successStatus("get", "/branding"));
      Branding.parse(ok.body);
    }
    expectError(await t.http().get("/branding"), 401, "INVALID_SESSION");
  });

  it("PUT /branding: 200 Branding, 400 INVALID_DATA with fields, 403 for a barber, 401", async () => {
    covered.add("put /branding");
    const ok = await t.http().put("/branding").set(shop.owner.auth).send(valid);
    expect(ok.status).toBe(successStatus("put", "/branding"));
    Branding.parse(ok.body);

    const invalid = expectError(
      await t
        .http()
        .put("/branding")
        .set(shop.owner.auth)
        .send({ ...valid, name: "", theme: "sepia" }),
      400,
      "INVALID_DATA",
    );
    expect(Object.keys(invalid.fields ?? {})).toEqual(
      expect.arrayContaining(["name", "theme"]),
    );

    expectError(
      await t.http().put("/branding").set(shop.barber.auth).send(valid),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().put("/branding").send(valid),
      401,
      "INVALID_SESSION",
    );
  });

  it("PUT /branding/logo: 200 Branding, the documented 400 and 413 codes, 403, 401", async () => {
    covered.add("put /branding/logo");
    const ok = await t
      .http()
      .put("/branding/logo")
      .set(shop.owner.auth)
      .set("Content-Type", "image/png")
      .send(png(200, 200));
    expect(ok.status).toBe(successStatus("put", "/branding/logo"));
    expect(Branding.parse(ok.body).logoUrl).not.toBeNull();

    expectError(
      await t
        .http()
        .put("/branding/logo")
        .set(shop.owner.auth)
        .set("Content-Type", "image/png")
        .send(png(63, 63)),
      400,
      "LOGO_INVALID_DIMENSIONS",
    );
    expectError(
      await t
        .http()
        .put("/branding/logo")
        .set(shop.owner.auth)
        .set("Content-Type", "image/png")
        .send(png(200, 200, 524_289)),
      413,
      "LOGO_TOO_LARGE",
    );
    expectError(
      await t
        .http()
        .put("/branding/logo")
        .set(shop.barber.auth)
        .set("Content-Type", "image/png")
        .send(png(200, 200)),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t
        .http()
        .put("/branding/logo")
        .set("Content-Type", "image/png")
        .send(png(200, 200)),
      401,
      "INVALID_SESSION",
    );
  });

  it("covers the registry routes of this group", () => {
    expectRoutesCovered(
      ["get /branding", "put /branding", "put /branding/logo"],
      covered,
    );
  });
});
