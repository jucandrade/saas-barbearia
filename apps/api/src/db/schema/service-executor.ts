import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";
import { service } from "./service.js";
import { user } from "./user.js";

/**
 * A user (barber or owner) who performs a service, with optional specific price and
 * duration. Null means "use the service default" (FR-009).
 */
export const serviceExecutor = pgTable(
  "service_executors",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    serviceId: uuid("service_id").notNull(),
    userId: uuid("user_id").notNull(),
    priceCents: integer("price_cents"),
    durationMinutes: integer("duration_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "service_executors_pk",
      columns: [t.serviceId, t.userId],
    }),
    check(
      "service_executors_price",
      sql`${t.priceCents} is null or ${t.priceCents} between 0 and 1000000`,
    ),
    check(
      "service_executors_duration",
      sql`${t.durationMinutes} is null or (${t.durationMinutes} between 5 and 480 and ${t.durationMinutes} % 5 = 0)`,
    ),
    // Same-tenant guarantee in the database, on top of RLS.
    foreignKey({
      name: "service_executors_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [service.tenantId, service.id],
    }),
    foreignKey({
      name: "service_executors_user_fk",
      columns: [t.tenantId, t.userId],
      foreignColumns: [user.tenantId, user.id],
    }),
    index("service_executors_user_idx").on(t.tenantId, t.userId),
    tenantPolicy("service_executors_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
