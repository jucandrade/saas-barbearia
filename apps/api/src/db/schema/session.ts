import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { bytea, tenantPolicy } from "./common.js";
import { user } from "./user.js";

/** Opaque server-side session; the token exists only on the client, here we keep its hash. */
export const session = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    tokenHash: bytea("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessions_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    tenantPolicy("sessions_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
