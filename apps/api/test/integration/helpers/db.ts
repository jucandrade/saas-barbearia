import { randomUUID } from "node:crypto";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "../../../src/db/schema/index.js";

function requireUser(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `${name} not set: the integration tests' global-setup did not run`,
    );
  }
  return value;
}

let poolOwner: pg.Pool | undefined;
let poolRuntime: pg.Pool | undefined;
let poolSuper: pg.Pool | undefined;

/** Admin connection: `owner_test`, the table owner, not a superuser. */
export function adminConnection(): pg.Pool {
  poolOwner ??= new pg.Pool({
    connectionString: requireUser("TEST_OWNER_URL"),
    max: 4,
  });
  return poolOwner;
}

/** API connection: `app_runtime`, without `BYPASSRLS` and not the table owner. */
export function runtimeConnection(): pg.Pool {
  poolRuntime ??= new pg.Pool({
    connectionString: requireUser("TEST_RUNTIME_URL"),
    max: 4,
  });
  return poolRuntime;
}

/** Superuser, only to count rows across all tenants in assertions. */
export function superConnection(): pg.Pool {
  poolSuper ??= new pg.Pool({
    connectionString: requireUser("TEST_SUPER_URL"),
    max: 2,
  });
  return poolSuper;
}

/** How many barbershops exist with the name, across all tenants. */
export async function countBarbershops(name: string): Promise<number> {
  const { rows } = await superConnection().query<{ n: number }>(
    "select count(*)::int as n from barbershops where name = $1",
    [name],
  );
  return rows[0]?.n ?? 0;
}

/** How many users exist with the e-mail, across all tenants. */
export async function countUsersByEmail(email: string): Promise<number> {
  const { rows } = await superConnection().query<{ n: number }>(
    "select count(*)::int as n from users where email = $1",
    [email],
  );
  return rows[0]?.n ?? 0;
}

export function urlRuntime(): string {
  return requireUser("TEST_RUNTIME_URL");
}

export async function closeConnections(): Promise<void> {
  await Promise.all([poolOwner?.end(), poolRuntime?.end(), poolSuper?.end()]);
  poolOwner = undefined;
  poolRuntime = undefined;
  poolSuper = undefined;
}

export type AdminDatabase = NodePgDatabase<typeof schema>;

/**
 * Runs `fn` as admin, but with the tenant context set: RLS also applies to the table owner
 * (FORCE), so even the factory needs it.
 */
export async function withTenantAdmin<T>(
  tenantId: string,
  fn: (
    tx: Parameters<Parameters<AdminDatabase["transaction"]>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  const database = drizzle(adminConnection(), { schema });
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

export const newUuid = (): string => randomUUID();
