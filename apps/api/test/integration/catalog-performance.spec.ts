import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ServicesOutput } from "@barbearia/contracts";
import { POOL } from "../../src/db/tenant-db.js";
import { createApp, type TestApp } from "./helpers/app.js";
import { createCatalogShop } from "./helpers/catalog.js";
import { closeConnections, newUuid, withTenantAdmin } from "./helpers/db.js";
import { createCategory, createUser } from "./helpers/factory.js";
import { normalizeName } from "@barbearia/domain";
import { service, serviceExecutor } from "../../src/db/schema/index.js";

const COUNTED = Symbol("counted");

/** Counts the data queries the pool runs, ignoring transaction control and the tenant setting. */
function countQueries(pool: Pool): { reset: () => void; total: () => number } {
  let total = 0;
  const original = pool.connect.bind(pool) as (
    ...args: unknown[]
  ) => Promise<PoolClient>;
  const patched = (...args: unknown[]): unknown => {
    // `pool.query` checks a client out with a callback: leave that path alone.
    if (typeof args[0] === "function") {
      return original(...args);
    }
    return (async () => {
      const client = await original();
      const flagged = client as unknown as Record<symbol, boolean | undefined>;
      if (flagged[COUNTED] !== true) {
        flagged[COUNTED] = true;
        const query = client.query.bind(client) as (...a: unknown[]) => unknown;
        (client as unknown as { query: (...a: unknown[]) => unknown }).query = (
          ...queryArgs: unknown[]
        ) => {
          const first = queryArgs[0];
          const text =
            typeof first === "string"
              ? first
              : ((first as { text?: string } | undefined)?.text ?? "");
          if (/\bfrom\b/i.test(text) && !/set_config/i.test(text)) total += 1;
          return query(...queryArgs);
        };
      }
      return client;
    })();
  };
  (pool as unknown as { connect: typeof patched }).connect = patched;
  return {
    reset: () => {
      total = 0;
    },
    total: () => total,
  };
}

/** SC-006: a catalog with 100 services lists fast, with a constant number of queries (no N+1). */
describe("catalog performance", () => {
  let t: TestApp;
  let queries: ReturnType<typeof countQueries>;

  beforeAll(async () => {
    t = await createApp();
    queries = countQueries(t.app.get<Pool>(POOL));
  });

  afterAll(async () => {
    await t.close();
    await closeConnections();
  });

  /** One bulk transaction: creating hundreds of rows one by one would only measure the test setup. */
  async function populate(size: number) {
    const shop = await createCatalogShop(t, `Perf ${String(size)}`);
    const barbers = [shop.barber.id];
    for (let i = 0; i < 4; i += 1) {
      barbers.push(
        await createUser({ tenantId: shop.tenantId, role: "barber" }),
      );
    }
    const categories: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      categories.push(
        await createCategory({
          tenantId: shop.tenantId,
          name: `Categoria ${String(i)}`,
          position: i,
        }),
      );
    }
    const services = Array.from({ length: size }, (_, i) => {
      const name = `Serviço ${String(i).padStart(3, "0")}`;
      return {
        id: newUuid(),
        tenantId: shop.tenantId,
        categoryId: categories[i % categories.length] ?? "",
        name,
        nameKey: normalizeName(name),
        durationMinutes: 30,
        priceCents: 5000,
      };
    });
    await withTenantAdmin(shop.tenantId, async (tx) => {
      await tx.insert(service).values(services);
      await tx.insert(serviceExecutor).values(
        services.flatMap((s) =>
          barbers.map((userId) => ({
            tenantId: shop.tenantId,
            serviceId: s.id,
            userId,
          })),
        ),
      );
    });
    return shop;
  }

  it("lists 100 services in a few ms of server time and a constant number of queries", async () => {
    const small = await populate(10);
    const big = await populate(100);

    queries.reset();
    const smallResponse = await t.http().get("/services").set(small.owner.auth);
    const smallQueries = queries.total();
    expect(ServicesOutput.parse(smallResponse.body).services).toHaveLength(10);

    queries.reset();
    const started = performance.now();
    const response = await t.http().get("/services").set(big.owner.auth);
    const elapsed = performance.now() - started;
    const bigQueries = queries.total();

    expect(ServicesOutput.parse(response.body).services).toHaveLength(100);
    // The counter must be counting something, or the checks below would prove nothing.
    expect(bigQueries).toBeGreaterThan(0);
    expect(bigQueries).toBe(smallQueries);
    expect(bigQueries).toBeLessThanOrEqual(5);
    expect(elapsed).toBeLessThan(500);
  });

  it("the barber's view of 100 services is as cheap", async () => {
    const shop = await populate(100);
    queries.reset();
    const response = await t.http().get("/services").set(shop.barber.auth);
    expect(ServicesOutput.parse(response.body).services).toHaveLength(100);
    expect(queries.total()).toBeGreaterThan(0);
    expect(queries.total()).toBeLessThanOrEqual(5);
  });
});
