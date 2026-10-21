import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { bytea, tenantPolicy } from "./common.js";
import { user } from "./user.js";

export const tokenPurpose = pgEnum("token_purpose", ["invitation", "recovery"]);

/** Invitation (first access) and password recovery: single use, only the hash is stored. */
export const accessToken = pgTable(
  "access_tokens",
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
    purpose: tokenPurpose("purpose").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("access_tokens_hash_unique").on(t.tokenHash),
    index("access_tokens_user_idx").on(t.userId),
    tenantPolicy("access_tokens_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
