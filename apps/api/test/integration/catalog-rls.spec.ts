import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminConnection,
  closeConnections,
  runtimeConnection,
  superConnection,
  withTenantAdmin,
} from "./helpers/db.js";
import {
  createBarbershop,
  createCatalogEventInDatabase,
  createCategory,
  createService,
  createUser,
  linkExecutor,
} from "./helpers/factory.js";
import { service } from "../../src/db/schema/index.js";

interface Tenant {
  barbershopId: string;
  ownerId: string;
  categoryId: string;
  serviceId: string;
}

const TABLES = [
  "service_categories",
  "services",
  "service_executors",
  "catalog_events",
] as const;

type Pool = ReturnType<typeof runtimeConnection>;

/** Runs the statement in a transaction with (or without) the tenant context, always rolled back. */
async function attempt(
  pool: Pool,
  tenantId: string | undefined,
  sql: string,
): Promise<
  { rows: Record<string, unknown>[]; affected: number } | { error: string }
> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (tenantId !== undefined) {
      await client.query("select set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
    }
    const result = await client.query(sql);
    return { rows: result.rows, affected: result.rowCount ?? 0 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const source = cause instanceof Error ? cause : error;
    return source instanceof Error ? source.message : String(source);
  }
  return "";
}

describe("catalog RLS: isolation and integrity in the database", () => {
  let a: Tenant;
  let b: Tenant;

  async function seed(name: string): Promise<Tenant> {
    const { barbershopId } = await createBarbershop(name);
    const ownerId = await createUser({ tenantId: barbershopId, role: "owner" });
    const categoryId = await createCategory({ tenantId: barbershopId });
    const serviceId = await createService({
      tenantId: barbershopId,
      categoryId,
    });
    await linkExecutor({ tenantId: barbershopId, serviceId, userId: ownerId });
    await createCatalogEventInDatabase(barbershopId, ownerId);
    return { barbershopId, ownerId, categoryId, serviceId };
  }

  beforeAll(async () => {
    a = await seed("Catalog A");
    b = await seed("Catalog B");
  });

  afterAll(closeConnections);

  it.each(TABLES)(
    "%s has ENABLE and FORCE ROW LEVEL SECURITY",
    async (table) => {
      const { rows } = await superConnection().query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        "select relrowsecurity, relforcerowsecurity from pg_class where relname = $1",
        [table],
      );
      expect(rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
    },
  );

  it.each(TABLES)(
    "%s: no tenant context reads and writes nothing",
    async (table) => {
      const read = await attempt(
        runtimeConnection(),
        undefined,
        `select * from ${table}`,
      );
      expect(read).toEqual({ rows: [], affected: 0 });
      const write = await attempt(
        runtimeConnection(),
        undefined,
        `insert into ${table} (tenant_id) values ('${a.barbershopId}')`,
      );
      expect("error" in write).toBe(true);
    },
  );

  it.each(TABLES)("%s: a tenant sees only its own rows", async (table) => {
    const result = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `select tenant_id from ${table}`,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(new Set(result.rows.map((r) => r["tenant_id"]))).toEqual(
      new Set([a.barbershopId]),
    );
  });

  it("another tenant's rows cannot be updated or deleted", async () => {
    const update = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `update services set price_cents = 1 where id = '${b.serviceId}'`,
    );
    expect(update).toMatchObject({ affected: 0 });

    const remove = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `delete from service_categories where id = '${b.categoryId}'`,
    );
    expect(remove).toMatchObject({ affected: 0 });

    const unlink = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `delete from service_executors where service_id = '${b.serviceId}'`,
    );
    expect(unlink).toMatchObject({ affected: 0 });
  });

  it("a tenant cannot write a row that belongs to another tenant", async () => {
    const result = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `insert into service_categories (tenant_id, name, name_key, position)
       values ('${b.barbershopId}', 'Intruder', 'intruder', 0)`,
    );
    expect("error" in result && result.error).toMatch(/row-level security/);
  });

  it("the composite keys refuse a service with a category of another tenant", async () => {
    const message = await errorOf(
      withTenantAdmin(a.barbershopId, (tx) =>
        tx.insert(service).values({
          tenantId: a.barbershopId,
          categoryId: b.categoryId,
          name: "Crossed",
          nameKey: "crossed",
          durationMinutes: 30,
          priceCents: 1000,
        }),
      ),
    );
    expect(message).toMatch(/services_category_fk/);
  });

  it("the composite keys refuse an executor from another tenant", async () => {
    const message = await errorOf(
      linkExecutor({
        tenantId: a.barbershopId,
        serviceId: a.serviceId,
        userId: b.ownerId,
      }),
    );
    expect(message).toMatch(/service_executors_user_fk/);
  });

  it("the composite keys refuse a link to a service of another tenant", async () => {
    const message = await errorOf(
      linkExecutor({
        tenantId: a.barbershopId,
        serviceId: b.serviceId,
        userId: a.ownerId,
      }),
    );
    expect(message).toMatch(/service_executors_service_fk/);
  });

  it("app_runtime cannot DELETE services (they are never erased)", async () => {
    const result = await attempt(
      runtimeConnection(),
      a.barbershopId,
      `delete from services where id = '${a.serviceId}'`,
    );
    expect("error" in result && result.error).toMatch(/permission denied/);
  });

  it("a category with services cannot be removed (RESTRICT)", async () => {
    const message = await errorOf(
      withTenantAdmin(a.barbershopId, async (tx) => {
        await tx.execute(
          sql`delete from service_categories where id = ${a.categoryId}`,
        );
      }),
    );
    expect(message).toMatch(/services_category_fk/);
  });

  it("catalog_events refuses UPDATE and DELETE for app_runtime", async () => {
    for (const sql of [
      "update catalog_events set type = 'category_deleted'",
      "delete from catalog_events",
    ]) {
      const result = await attempt(runtimeConnection(), a.barbershopId, sql);
      expect("error" in result && result.error).toMatch(/permission denied/);
    }
  });

  it("catalog_events is immutable even for the table owner", async () => {
    for (const sql of [
      "update catalog_events set type = 'category_deleted'",
      "delete from catalog_events",
      "truncate catalog_events",
    ]) {
      const result = await attempt(adminConnection(), a.barbershopId, sql);
      expect("error" in result && result.error).toMatch(/IMMUTABLE_EVENT/);
    }
  });

  it("the checks refuse invalid duration, price and name length", async () => {
    const base = `insert into services (tenant_id, category_id, name, name_key, duration_minutes, price_cents)`;
    const cases: [string, RegExp][] = [
      [
        `${base} values ('${a.barbershopId}','${a.categoryId}','D','d1',37,1000)`,
        /services_duration/,
      ],
      [
        `${base} values ('${a.barbershopId}','${a.categoryId}','D','d2',485,1000)`,
        /services_duration/,
      ],
      [
        `${base} values ('${a.barbershopId}','${a.categoryId}','P','p1',30,-1)`,
        /services_price/,
      ],
      [
        `${base} values ('${a.barbershopId}','${a.categoryId}','P','p2',30,1000001)`,
        /services_price/,
      ],
      [
        `${base} values ('${a.barbershopId}','${a.categoryId}','${"n".repeat(81)}','n1',30,1000)`,
        /services_name_length/,
      ],
    ];
    for (const [sql, pattern] of cases) {
      const result = await attempt(adminConnection(), a.barbershopId, sql);
      expect("error" in result && result.error, sql).toMatch(pattern);
    }
    const link = await attempt(
      adminConnection(),
      a.barbershopId,
      `update service_executors set duration_minutes = 37 where service_id = '${a.serviceId}'`,
    );
    expect("error" in link && link.error).toMatch(/service_executors_duration/);
  });

  it("names are unique per tenant, deactivated services included, but not across tenants", async () => {
    await createService({
      tenantId: a.barbershopId,
      categoryId: a.categoryId,
      name: "Shared Name",
      status: "deactivated",
    });
    const duplicate = await errorOf(
      createService({
        tenantId: a.barbershopId,
        categoryId: a.categoryId,
        name: "  SHARED name ",
      }),
    );
    expect(duplicate).toMatch(/services_name_key/);
    await expect(
      createService({
        tenantId: b.barbershopId,
        categoryId: b.categoryId,
        name: "Shared Name",
      }),
    ).resolves.toBeTypeOf("string");
  });
});
