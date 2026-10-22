import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantPolicy } from "./common.js";

/** The tenant. Its `id` is the `tenant_id` of the other tables. */
export const barbershop = pgTable(
  "barbershops",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "barbershops_name_length",
      sql`char_length(${t.name}) between 1 and 120`,
    ),
    tenantPolicy("barbershops_isolation", sql`${t.id}`),
  ],
).enableRLS();
