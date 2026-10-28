import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { bytea, tenantPolicy } from "./common.js";

/** Mirrors `LOGO_TYPES` of `@barbearia/domain` (a unit test keeps them equal). */
export const logoType = pgEnum("logo_type", [
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/**
 * The logo bytes, apart from `barbershop_branding` so reading the identity never pulls up
 * to 512 KB (R4). Public reads go only through `public_get_logo`.
 */
export const barbershopLogo = pgTable(
  "barbershop_logos",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => barbershop.id),
    content: bytea("content").notNull(),
    /** Type detected from the bytes, never the one the client declared. */
    contentType: logoType("content_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** First 16 hex characters of the SHA-256 of `content`. */
    version: text("version").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "barbershop_logos_size",
      sql`octet_length(${t.content}) between 1 and 524288`,
    ),
    check(
      "barbershop_logos_dimensions",
      sql`least(${t.width}, ${t.height}) >= 64 and greatest(${t.width}, ${t.height}) <= 2000`,
    ),
    tenantPolicy("barbershop_logos_isolation", sql`${t.tenantId}`),
  ],
).enableRLS();
