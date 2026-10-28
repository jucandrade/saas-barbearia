import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Branding } from "@barbearia/contracts";
import { createApp, type TestApp } from "./helpers/app.js";
import {
  brandingEventsOf,
  createBrandingShop,
  type BrandingShop,
} from "./helpers/branding.js";
import { closeConnections } from "./helpers/db.js";

const valid = {
  name: "Barbearia do Billy",
  theme: "day",
  primaryTone: "blue",
  accentTone: "gold",
} as const;

describe("branding flows", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createApp();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  it("without any customization GET /branding is the product default with the registered name", async () => {
    const shop = await createBrandingShop(t, "Default Look");
    const response = await t.http().get("/branding").set(shop.owner.auth);
    expect(response.status).toBe(200);
    expect(Branding.parse(response.body)).toEqual({
      name: shop.name,
      theme: "noir",
      primaryTone: "gold",
      accentTone: "gold",
      logoUrl: null,
      customized: false,
      updatedAt: null,
    });
  });

  it("answers GET /branding with Cache-Control private, no-store (a change reaches the next screen)", async () => {
    const shop = await createBrandingShop(t, "No Store");
    const response = await t.http().get("/branding").set(shop.barber.auth);
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("PUT /branding saves and GET returns what was saved, for the owner and the barber", async () => {
    const shop = await createBrandingShop(t, "Save Look");
    const saved = await t
      .http()
      .put("/branding")
      .set(shop.owner.auth)
      .send(valid);
    expect(saved.status).toBe(200);
    expect(Branding.parse(saved.body)).toMatchObject({
      ...valid,
      logoUrl: null,
      customized: true,
    });

    for (const actor of [shop.owner, shop.barber]) {
      const read = await t.http().get("/branding").set(actor.auth);
      expect(Branding.parse(read.body)).toMatchObject({
        ...valid,
        customized: true,
      });
    }
  });

  it("changing the name updates /auth/me too", async () => {
    const shop = await createBrandingShop(t, "Rename Me");
    await t
      .http()
      .put("/branding")
      .set(shop.owner.auth)
      .send({ ...valid, name: "  Nome Novo  " });
    const me = await t.http().get("/auth/me").set(shop.barber.auth);
    expect((me.body as { barbershop: { name: string } }).barbershop.name).toBe(
      "Nome Novo",
    );
  });

  it("rejects an empty, blank or 81-character name, with the field and nothing saved", async () => {
    const shop = await createBrandingShop(t, "Bad Name");
    for (const name of ["", "   ", "a".repeat(81)]) {
      const response = await t
        .http()
        .put("/branding")
        .set(shop.owner.auth)
        .send({ ...valid, name });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "INVALID_DATA" });
      expect(
        (response.body as { fields: Record<string, string> }).fields["name"],
      ).toEqual(expect.any(String));
    }
    const read = await t.http().get("/branding").set(shop.owner.auth);
    expect(Branding.parse(read.body)).toMatchObject({
      name: shop.name,
      customized: false,
    });
  });

  it("rejects a theme or tone outside the closed lists (there is no free color)", async () => {
    const shop = await createBrandingShop(t, "Closed Lists");
    for (const bad of [
      { theme: "sepia" },
      { primaryTone: "#ff0000" },
      { accentTone: "red" },
      { theme: undefined },
    ]) {
      const response = await t
        .http()
        .put("/branding")
        .set(shop.owner.auth)
        .send({ ...valid, ...bad });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "INVALID_DATA" });
    }
  });

  it("accepts the same tone as primary and accent", async () => {
    const shop = await createBrandingShop(t, "Same Tone");
    const response = await t
      .http()
      .put("/branding")
      .set(shop.owner.auth)
      .send({ ...valid, primaryTone: "teal", accentTone: "teal" });
    expect(response.status).toBe(200);
  });

  it("denies the barber and the visitor any write", async () => {
    const shop = await createBrandingShop(t, "Permissions");
    const barber = await t
      .http()
      .put("/branding")
      .set(shop.barber.auth)
      .send(valid);
    expect(barber.status).toBe(403);
    expect(barber.body).toMatchObject({ code: "NO_PERMISSION" });

    const visitor = await t.http().put("/branding").send(valid);
    expect(visitor.status).toBe(401);

    const read = await t.http().get("/branding").set(shop.owner.auth);
    expect(Branding.parse(read.body).customized).toBe(false);
  });

  it("the last write wins and both writes leave an event, without the text of the name", async () => {
    const shop = await createBrandingShop(t, "Last Write");
    await t
      .http()
      .put("/branding")
      .set(shop.owner.auth)
      .send({ ...valid, name: "Primeiro Nome", theme: "leather" });
    await t
      .http()
      .put("/branding")
      .set(shop.owner.auth)
      .send({ ...valid, name: "Segundo Nome", theme: "day" });

    const read = await t.http().get("/branding").set(shop.owner.auth);
    expect(Branding.parse(read.body)).toMatchObject({
      name: "Segundo Nome",
      theme: "day",
    });

    const events = await brandingEventsOf(shop.tenantId);
    expect(events.map((e) => e.type)).toEqual([
      "branding_updated",
      "branding_updated",
    ]);
    expect(events.every((e) => e.actorUserId === shop.owner.id)).toBe(true);
    const text = JSON.stringify(events.map((e) => e.details));
    expect(text).not.toContain("Primeiro Nome");
    expect(text).not.toContain("Segundo Nome");
    const details = events[0]?.details as {
      fields: string[];
      theme: { from: string; to: string };
    };
    expect(details.fields).toEqual(["displayName", "theme"]);
    expect(details.theme).toEqual({ from: "leather", to: "day" });
  });

  it("saving the same values again records no field as changed", async () => {
    const shop = await createBrandingShop(t, "Idempotent");
    const send = () =>
      t.http().put("/branding").set(shop.owner.auth).send({
        name: shop.name,
        theme: "noir",
        primaryTone: "gold",
        accentTone: "gold",
      });
    await send();
    await send();
    const events = await brandingEventsOf(shop.tenantId);
    // The first save creates the customization; the second changes nothing.
    expect(events).toHaveLength(2);
    expect(events[0]?.details).toMatchObject({ fields: [] });
  });

  it("each barbershop keeps its own identity", async () => {
    const one = await createBrandingShop(t, "Isolation One");
    const two = await createBrandingShop(t, "Isolation Two");
    await t
      .http()
      .put("/branding")
      .set(one.owner.auth)
      .send({ ...valid, theme: "leather" });
    const read = await t.http().get("/branding").set(two.owner.auth);
    expect(Branding.parse(read.body)).toMatchObject({
      theme: "noir",
      customized: false,
    });
  });
});

export type { BrandingShop };
