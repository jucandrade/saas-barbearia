import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Branding } from "@barbearia/contracts";
import { barbershopLogo } from "../../src/db/schema/index.js";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  brandingEventsOf,
  createBrandingShop,
  type BrandingShop,
} from "./helpers/branding.js";
import { closeConnections, withTenantAdmin } from "./helpers/db.js";
import { png } from "./helpers/images.js";

describe("restoring the product default (US5)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  async function customized(label: string): Promise<BrandingShop> {
    const shop = await createBrandingShop(t, label);
    await t.http().put("/branding").set(shop.owner.auth).send({
      name: "Nome Personalizado",
      theme: "leather",
      primaryTone: "wine",
      accentTone: "rose",
    });
    await t
      .http()
      .put("/branding/logo")
      .set(shop.owner.auth)
      .set("Content-Type", "image/png")
      .send(png(200, 200));
    return shop;
  }

  const logoRows = (tenantId: string) =>
    withTenantAdmin(tenantId, (tx) =>
      tx
        .select()
        .from(barbershopLogo)
        .where(eq(barbershopLogo.tenantId, tenantId)),
    );

  describe("POST /branding/reset", () => {
    it("brings back Noir and gold, keeping the name and the logo", async () => {
      const shop = await customized("Reset Keep");
      const response = await t
        .http()
        .post("/branding/reset")
        .set(shop.owner.auth);
      expect(response.status).toBe(200);
      const branding = Branding.parse(response.body);
      expect(branding).toMatchObject({
        name: "Nome Personalizado",
        theme: "noir",
        primaryTone: "gold",
        accentTone: "gold",
      });
      expect(branding.logoUrl).not.toBeNull();
      expect(await logoRows(shop.tenantId)).toHaveLength(1);
    });

    it("leaves a branding_reset event with the closed values, without the name", async () => {
      const shop = await customized("Reset Event");
      await t.http().post("/branding/reset").set(shop.owner.auth);
      const events = await brandingEventsOf(shop.tenantId);
      expect(events[0]).toMatchObject({
        type: "branding_reset",
        actorUserId: shop.owner.id,
      });
      const details = events[0]?.details as {
        theme: { from: string; to: string };
      };
      expect(details.theme).toEqual({ from: "leather", to: "noir" });
      expect(JSON.stringify(events[0]?.details)).not.toContain(
        "Nome Personalizado",
      );
    });

    it("works on a barbershop that never customized anything", async () => {
      const shop = await createBrandingShop(t, "Reset Plain");
      const response = await t
        .http()
        .post("/branding/reset")
        .set(shop.owner.auth);
      expect(response.status).toBe(200);
      expect(Branding.parse(response.body)).toMatchObject({
        theme: "noir",
        primaryTone: "gold",
        accentTone: "gold",
      });
    });

    it("denies the barber and the visitor, and touches nothing", async () => {
      const shop = await customized("Reset Denied");
      const barber = await t
        .http()
        .post("/branding/reset")
        .set(shop.barber.auth);
      expect(barber.status).toBe(403);
      expect(barber.body).toMatchObject({ code: "NO_PERMISSION" });
      expect((await t.http().post("/branding/reset")).status).toBe(401);

      const read = await t.http().get("/branding").set(shop.owner.auth);
      expect(Branding.parse(read.body)).toMatchObject({ theme: "leather" });
    });

    it("does not reach another barbershop", async () => {
      const mine = await customized("Reset Mine");
      const other = await customized("Reset Other");
      await t.http().post("/branding/reset").set(mine.owner.auth);
      const read = await t.http().get("/branding").set(other.owner.auth);
      expect(Branding.parse(read.body)).toMatchObject({
        theme: "leather",
        primaryTone: "wine",
      });
    });
  });

  describe("DELETE /branding/logo", () => {
    it("removes the logo everywhere and keeps the rest of the identity", async () => {
      const shop = await customized("Logo Remove");
      const response = await t
        .http()
        .delete("/branding/logo")
        .set(shop.owner.auth);
      expect(response.status).toBe(200);
      expect(Branding.parse(response.body)).toMatchObject({
        logoUrl: null,
        theme: "leather",
        name: "Nome Personalizado",
      });
      expect(await logoRows(shop.tenantId)).toHaveLength(0);

      const publicLogo = await t
        .http()
        .get(`/public/barbershops/${shop.slug}/logo`);
      expect(publicLogo.status).toBe(404);
    });

    it("records logo_removed once, and removing again is a no-op that answers 200", async () => {
      const shop = await customized("Logo Remove Twice");
      await t.http().delete("/branding/logo").set(shop.owner.auth);
      const again = await t
        .http()
        .delete("/branding/logo")
        .set(shop.owner.auth);
      expect(again.status).toBe(200);
      expect(Branding.parse(again.body).logoUrl).toBeNull();

      const removed = (await brandingEventsOf(shop.tenantId)).filter(
        (event) => event.type === "logo_removed",
      );
      expect(removed).toHaveLength(1);
    });

    it("removing the logo of a barbershop that has none answers 200 and records nothing", async () => {
      const shop = await createBrandingShop(t, "Logo Remove None");
      const response = await t
        .http()
        .delete("/branding/logo")
        .set(shop.owner.auth);
      expect(response.status).toBe(200);
      expect(await brandingEventsOf(shop.tenantId)).toHaveLength(0);
    });

    it("denies the barber and the visitor", async () => {
      const shop = await customized("Logo Remove Denied");
      expect(
        (await t.http().delete("/branding/logo").set(shop.barber.auth)).status,
      ).toBe(403);
      expect((await t.http().delete("/branding/logo")).status).toBe(401);
      expect(await logoRows(shop.tenantId)).toHaveLength(1);
    });

    it("a new logo can be sent after removing the old one", async () => {
      const shop = await customized("Logo Remove Then Send");
      await t.http().delete("/branding/logo").set(shop.owner.auth);
      const response = await t
        .http()
        .put("/branding/logo")
        .set(shop.owner.auth)
        .set("Content-Type", "image/png")
        .send(png(300, 300));
      expect(response.status).toBe(200);
      expect(Branding.parse(response.body).logoUrl).not.toBeNull();
    });
  });
});
