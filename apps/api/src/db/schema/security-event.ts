import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { contextTenant } from "./common.js";

export const securityEventType = pgEnum("security_event_type", [
  "barbershop_provisioned",
  "invitation_sent",
  "invitation_accepted",
  "login_success",
  "login_failure",
  "logout",
  "password_recovery_requested",
  "password_reset",
  "user_deactivated",
  "user_reactivated",
  "user_anonymized",
]);

export const actorType = pgEnum("actor_type", ["user", "platform", "system"]);

/**
 * Immutable audit trail. `tenant_id` is null only for login failures of an
 * unknown e-mail; those events are not visible to any barbershop. Never
 * stores e-mail, name, password, token or IP.
 */
export const securityEvent = pgTable(
  "security_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id").references(() => barbershop.id),
    type: securityEventType("type").notNull(),
    actorType: actorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id"),
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
    index("security_events_tenant_idx").on(t.tenantId, t.occurredAt),
    pgPolicy("security_events_read", {
      as: "permissive",
      for: "select",
      using: sql`${t.tenantId} = ${contextTenant}`,
    }),
    pgPolicy("security_events_write", {
      as: "permissive",
      for: "insert",
      withCheck: sql`${t.tenantId} is null or ${t.tenantId} = ${contextTenant}`,
    }),
  ],
).enableRLS();
