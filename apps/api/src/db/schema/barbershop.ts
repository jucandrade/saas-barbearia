import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantPolicy } from "./common.js";

/** The tenant. Its `id` is the `tenant_id` of the other tables. */
export const barbershop = pgTable(
  "barbershops",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    /**
     * Public identifier of the barbershop link (R2): lowercase letters, digits and single
     * hyphens, 3 to 40 characters. Provisioning derives it from the name; the default is only
     * a safety net so no row is ever born without one.
     */
    publicSlug: text("public_slug")
      .notNull()
      .default(sql`'barbearia-' || substr(gen_random_uuid()::text, 1, 8)`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "barbershops_name_length",
      sql`char_length(${t.name}) between 1 and 120`,
    ),
    check(
      "barbershops_public_slug_format",
      sql`${t.publicSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.publicSlug}) between 3 and 40`,
    ),
    unique("barbershops_public_slug").on(t.publicSlug),
    tenantPolicy("barbershops_isolation", sql`${t.id}`),
  ],
).enableRLS();
