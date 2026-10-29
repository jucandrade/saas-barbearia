import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brandingEventType } from "../../src/db/schema/index.js";
import { CapturingLogger, createApp, type TestApp } from "./helpers/app.js";
import {
  brandingEventsOf,
  createBrandingShop,
  type BrandingShop,
} from "./helpers/branding.js";
import { closeConnections } from "./helpers/db.js";
import { png, svg } from "./helpers/images.js";

const SECRET_NAME = "Barbearia Segredo Absoluto";

/** FR-014 and principle IX: every change is recorded, nothing personal and no logo is, and the past stays put. */
describe("branding audit trail, end to end", () => {
  let t: TestApp;
  let shop: BrandingShop;
  const logger = new CapturingLogger();

  beforeAll(async () => {
    t = await createApp({ logger });
    shop = await createBrandingShop(t, "Audit Branding");
    await runEveryOperation();
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const owner = () => ({ ...shop.owner.auth });

  async function runEveryOperation(): Promise<void> {
    await t.http().put("/branding").set(owner()).send({
      name: SECRET_NAME,
      theme: "day",
      primaryTone: "blue",
      accentTone: "gold",
    });
    await t
      .http()
      .put("/branding/logo")
      .set(owner())
      .set("Content-Type", "image/png")
      .send(png(200, 200));
    await t.http().delete("/branding/logo").set(owner());
    await t.http().post("/branding/reset").set(owner());
    // Refused and denied attempts leave nothing behind.
    await t
      .http()
      .put("/branding/logo")
      .set(owner())
      .set("Content-Type", "image/png")
      .send(svg());
    await t.http().put("/branding").set(shop.barber.auth).send({
      name: "Hack",
      theme: "noir",
      primaryTone: "gold",
      accentTone: "gold",
    });
  }

  it("records one event of each of the 4 types, with author and time", async () => {
    const events = await brandingEventsOf(shop.tenantId);
    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(brandingEventType.enumValues),
    );
    for (const event of events) {
      expect(event.tenantId).toBe(shop.tenantId);
      expect(event.actorUserId).toBe(shop.owner.id);
      expect(event.occurredAt).toBeInstanceOf(Date);
    }
  });

  it("records nothing for refused or denied attempts", async () => {
    const events = await brandingEventsOf(shop.tenantId);
    expect(events).toHaveLength(4);
    expect(events.some((event) => event.actorUserId === shop.barber.id)).toBe(
      false,
    );
  });

  it("keeps the name, the logo and personal data out of the events", async () => {
    const dump = JSON.stringify(await brandingEventsOf(shop.tenantId));
    expect(dump).not.toContain(SECRET_NAME);
    expect(dump).not.toMatch(/Dona Ana|Bruno Barbeiro|@example\.com/);
    expect(dump).not.toMatch(/Bearer|token|password/i);
    expect(dump).not.toMatch(/image\/png|PNG|bytes|content/i);
  });

  it("keeps them out of the logs as well, failed attempts included", () => {
    const text = logger.lines.join("\n");
    expect(text).not.toContain(SECRET_NAME);
    expect(text).not.toMatch(/Dona Ana|Bruno Barbeiro|@example\.com/);
    expect(text).not.toContain(shop.owner.auth.Authorization.slice(7));
    expect(text).not.toContain(shop.barber.auth.Authorization.slice(7));
  });

  it("new changes never rewrite or remove earlier events", async () => {
    const before = await brandingEventsOf(shop.tenantId);
    await t.http().put("/branding").set(owner()).send({
      name: SECRET_NAME,
      theme: "leather",
      primaryTone: "sage",
      accentTone: "wine",
    });
    await t.http().post("/branding/reset").set(owner());
    const after = await brandingEventsOf(shop.tenantId);
    expect(after.length).toBe(before.length + 2);
    // Newest first: the earlier events are exactly the tail, untouched.
    expect(after.slice(after.length - before.length)).toEqual(before);
  });
});
