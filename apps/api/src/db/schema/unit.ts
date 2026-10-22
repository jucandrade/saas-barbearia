import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";

/** Place of service; every barbershop has at least one. */
export const unit = pgTable(
  "units",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => barbershop.id),
    name: text("name").notNull(),
    /** IANA name (for example, `America/Sao_Paulo`), validated on creation. */
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("units_name_length", sql`char_length(${t.name}) between 1 and 120`),
    check("unit_timezone_not_empty", sql`char_length(${t.timezone}) > 0`),
    index("units_tenant_idx").on(t.tenantId),
    tenantPolicy("units_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
