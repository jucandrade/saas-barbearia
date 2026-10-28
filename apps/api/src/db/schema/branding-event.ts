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

export const brandingEventType = pgEnum("branding_event_type", [
  "branding_updated",
  "logo_changed",
  "logo_removed",
  "branding_reset",
]);

/**
 * Immutable audit trail of the visual identity (FR-014). Never stores the logo, the text of
 * the name or any personal data: only field names and closed values (theme and tones).
 */
export const brandingEvent = pgTable(
  "branding_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    type: brandingEventType("type").notNull(),
    /** No foreign key, so the event outlives an anonymized user. */
    actorUserId: uuid("actor_user_id").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("branding_events_tenant_idx").on(t.tenantId, t.occurredAt),
    tenantPolicy("branding_events_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
