import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogEventType } from "../../src/db/schema/index.js";
import { CapturingLogger, createApp, type TestApp } from "./helpers/app.js";
import {
  catalogEventsOf,
  createCatalogShop,
  type CatalogShop,
} from "./helpers/catalog.js";
import { closeConnections } from "./helpers/db.js";

/** FR-014, SC-007 and principle IX: every change is recorded, nothing personal is, and the past stays put. */
describe("catalog audit trail, end to end", () => {
  let t: TestApp;
  let shop: CatalogShop;
  const logger = new CapturingLogger();

  beforeAll(async () => {
    t = await createApp({ logger });
    shop = await createCatalogShop(t, "Audit Full");
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  const send = (
    method: "post" | "patch" | "put" | "delete",
    path: string,
    body?: object,
  ) => {
    const request = t.http()[method](path).set(shop.owner.auth);
    return body === undefined ? request : request.send(body);
  };

  async function id(response: Promise<{ body: unknown }>): Promise<string> {
    return ((await response).body as { id: string }).id;
  }

  async function runEveryOperation(): Promise<void> {
    const hair = await id(
      send("post", "/service-categories", { name: "Cabelo" }),
    );
    const spare = await id(
      send("post", "/service-categories", { name: "Sobra" }),
    );
    await send("patch", `/service-categories/${hair}`, { name: "Cabelos" });
    await send("put", "/service-categories/order", { ids: [spare, hair] });
    await send("delete", `/service-categories/${spare}`);

    const cut = await id(
      send("post", "/services", {
        name: "Corte",
        categoryId: hair,
        priceCents: 5000,
        durationMinutes: 30,
      }),
    );
    await send("patch", `/services/${cut}`, { priceCents: 5500 });
    await send("post", `/services/${cut}/deactivate`);
    await send("post", `/services/${cut}/reactivate`);

    await send("put", `/services/${cut}/executors/${shop.barber.id}`, {});
    await send("put", `/services/${cut}/executors/${shop.barber.id}`, {
      priceCents: 6000,
    });
    await send("delete", `/services/${cut}/executors/${shop.barber.id}`);

    // Failed attempts must be logged without personal data too.
    await send("post", "/services", {
      name: "corte",
      categoryId: hair,
      priceCents: 1,
      durationMinutes: 30,
    });
    await send("patch", "/services/00000000-0000-4000-8000-000000000000", {
      priceCents: 1,
    });
  }

  it("records one event of each of the 11 types, with author and time", async () => {
    await runEveryOperation();
    const events = await catalogEventsOf(shop.tenantId);
    expect(new Set(events.map((e) => e.type))).toEqual(
      new Set(catalogEventType.enumValues),
    );
    for (const event of events) {
      expect(event.tenantId).toBe(shop.tenantId);
      expect(event.actorUserId).toBe(shop.owner.id);
      expect(event.occurredAt).toBeInstanceOf(Date);
    }
  });

  it("keeps names, e-mails, tokens and IPs out of the events", async () => {
    const dump = JSON.stringify(await catalogEventsOf(shop.tenantId));
    expect(dump).not.toMatch(/Dona Ana|Bruno Barbeiro|@example\.com/);
    expect(dump).not.toMatch(/Bearer|token|password/i);
    // Services and categories are recorded by id, not by name.
    expect(dump).not.toMatch(/Corte|Cabelo|Sobra/);
  });

  it("keeps them out of the logs as well, failed attempts included", () => {
    const text = logger.lines.join("\n");
    expect(text).not.toMatch(/Dona Ana|Bruno Barbeiro|@example\.com/);
    expect(text).not.toContain(shop.owner.auth.Authorization.slice(7));
    expect(text).not.toContain(shop.barber.auth.Authorization.slice(7));
  });

  it("new changes never rewrite or remove earlier events (SC-007)", async () => {
    const before = await catalogEventsOf(shop.tenantId);
    const category = await id(
      send("post", "/service-categories", { name: "Nova" }),
    );
    await send("patch", `/service-categories/${category}`, {
      name: "Novíssima",
    });
    await send("delete", `/service-categories/${category}`);
    const after = await catalogEventsOf(shop.tenantId);
    expect(after.length).toBe(before.length + 3);
    expect(after.slice(0, before.length)).toEqual(before);
  });
});
