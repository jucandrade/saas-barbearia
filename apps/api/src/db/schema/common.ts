import { sql } from "drizzle-orm";
import { customType, pgPolicy } from "drizzle-orm/pg-core";

/** Tenant context of the current transaction; empty = no tenant (fails closed). */
export const contextTenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

/** Default isolation policy: a row is only visible and writable inside its own tenant. */
export const tenantPolicy = (name: string, column: ReturnType<typeof sql>) =>
  pgPolicy(name, {
    as: "permissive",
    for: "all",
    using: sql`${column} = ${contextTenant}`,
    withCheck: sql`${column} = ${contextTenant}`,
  });

/** SHA-256 hash of a token, stored as bytes. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
