import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";

export const userRole = pgEnum("user_role", ["owner", "barber"]);
export const userStatus = pgEnum("user_status", [
  "invited",
  "active",
  "deactivated",
  "anonymized",
]);

export const user = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    name: text("name").notNull(),
    /** Normalized (trimmed, lowercase); unique across the whole system (FR-006, FR-023). */
    email: text("email").notNull(),
    /** Set on the invitation and immutable (FR-005). */
    role: userRole("role").notNull(),
    status: userStatus("status").notNull(),
    /** Argon2id (PHC). Null while `invited` and after anonymization. */
    passwordHash: text("password_hash"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  },
  (t) => [
    check("users_name_length", sql`char_length(${t.name}) between 1 and 120`),
    check("users_email_normalized", sql`${t.email} = lower(${t.email})`),
    check(
      "user_active_has_password",
      sql`${t.status} <> 'active' or ${t.passwordHash} is not null`,
    ),
    check(
      "users_anonymized_without_data",
      sql`${t.status} <> 'anonymized' or (${t.passwordHash} is null and ${t.anonymizedAt} is not null)`,
    ),
    uniqueIndex("users_email_unique").on(t.email),
    index("users_tenant_idx").on(t.tenantId),
    tenantPolicy("users_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
