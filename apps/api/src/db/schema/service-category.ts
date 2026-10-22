import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";

/** Group of services, managed by the owner and shown in a chosen order (FR-018). */
export const serviceCategory = pgTable(
  "service_categories",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    name: text("name").notNull(),
    /** `normalizeName(name)`, computed by the application; unique per barbershop. */
    nameKey: text("name_key").notNull(),
    /** Display order; not unique, ties are broken by `created_at`. */
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "service_categories_name_length",
      sql`char_length(${t.name}) between 1 and 80`,
    ),
    check("service_categories_position", sql`${t.position} >= 0`),
    // Target of the composite foreign key of `services`.
    unique("service_categories_tenant_id_id").on(t.tenantId, t.id),
    unique("service_categories_name_key").on(t.tenantId, t.nameKey),
    index("service_categories_tenant_idx").on(t.tenantId, t.position),
    tenantPolicy("service_categories_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
