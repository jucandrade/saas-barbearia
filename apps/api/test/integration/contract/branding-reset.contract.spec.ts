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

const covered = new Set<string>();

describe("contract: restoring the default identity", () => {
  let t: TestApp;
  let shop: BrandingShop;

  beforeAll(async () => {
    t = await createApp();
    shop = await createBrandingShop(t, "Contract Reset");
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("POST /branding/reset: 200 Branding, 403 for a barber, 401 without a session", async () => {
    covered.add("post /branding/reset");
    const ok = await t.http().post("/branding/reset").set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("post", "/branding/reset"));
    Branding.parse(ok.body);
    expectError(
      await t.http().post("/branding/reset").set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
    expectError(await t.http().post("/branding/reset"), 401, "INVALID_SESSION");
  });

  it("DELETE /branding/logo: 200 Branding, 403 for a barber, 401 without a session", async () => {
    covered.add("delete /branding/logo");
    const ok = await t.http().delete("/branding/logo").set(shop.owner.auth);
    expect(ok.status).toBe(successStatus("delete", "/branding/logo"));
    expect(Branding.parse(ok.body).logoUrl).toBeNull();
    expectError(
      await t.http().delete("/branding/logo").set(shop.barber.auth),
      403,
      "NO_PERMISSION",
    );
    expectError(
      await t.http().delete("/branding/logo"),
      401,
      "INVALID_SESSION",
    );
  });

  it("covers the registry routes of this group", () => {
    expectRoutesCovered(
      ["post /branding/reset", "delete /branding/logo"],
      covered,
    );
  });
});
