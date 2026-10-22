import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";
import { serviceCategory } from "./service-category.js";

export const serviceStatus = pgEnum("service_status", [
  "active",
  "deactivated",
]);

/**
 * What the barbershop sells (FR-001). Never deleted: `app_runtime` has no DELETE
 * privilege here, so deactivating is the only way to take a service out (FR-005).
 */
export const service = pgTable(
  "services",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    categoryId: uuid("category_id").notNull(),
    name: text("name").notNull(),
    /** `normalizeName(name)`; unique per barbershop, deactivated services included (FR-004). */
    nameKey: text("name_key").notNull(),
    description: text("description"),
    /** Default duration: a multiple of 5, from 5 to 480 minutes (FR-003). */
    durationMinutes: integer("duration_minutes").notNull(),
    /** Default price in whole cents, from 0 to R$ 10.000,00 (constitution II). */
    priceCents: integer("price_cents").notNull(),
    status: serviceStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("services_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "services_description_length",
      sql`${t.description} is null or char_length(${t.description}) between 1 and 500`,
    ),
    check(
      "services_duration",
      sql`${t.durationMinutes} between 5 and 480 and ${t.durationMinutes} % 5 = 0`,
    ),
    check("services_price", sql`${t.priceCents} between 0 and 1000000`),
    // Target of the composite foreign key of `service_executors`.
    unique("services_tenant_id_id").on(t.tenantId, t.id),
    unique("services_name_key").on(t.tenantId, t.nameKey),
    // A service never points to a category of another barbershop; RESTRICT keeps categories with services.
    foreignKey({
      name: "services_category_fk",
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [serviceCategory.tenantId, serviceCategory.id],
    }).onDelete("restrict"),
    index("services_tenant_idx").on(t.tenantId, t.categoryId),
    tenantPolicy("services_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
