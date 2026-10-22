import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";

export const catalogEventType = pgEnum("catalog_event_type", [
  "category_created",
  "category_renamed",
  "categories_reordered",
  "category_deleted",
  "service_created",
  "service_updated",
  "service_deactivated",
  "service_reactivated",
  "executor_linked",
  "executor_updated",
  "executor_unlinked",
]);

/**
 * Immutable audit trail of the catalog (FR-014). References people and records only by
 * identifier, with no foreign key, so it outlives removed categories and links.
 * Never stores e-mail or name of a person.
 */
export const catalogEvent = pgTable(
  "catalog_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    type: catalogEventType("type").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    serviceId: uuid("service_id"),
    categoryId: uuid("category_id"),
    targetUserId: uuid("target_user_id"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("catalog_events_tenant_idx").on(t.tenantId, t.occurredAt),
    tenantPolicy("catalog_events_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
