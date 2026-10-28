import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { barbershop } from "./barbershop.js";
import { tenantPolicy } from "./common.js";

/** Mirrors `THEME_IDS` of `@barbearia/domain` (a unit test keeps them equal). */
export const brandingTheme = pgEnum("branding_theme", [
  "noir",
  "day",
  "leather",
]);

/** Mirrors `TONE_IDS` of `@barbearia/domain` (a unit test keeps them equal). */
export const brandingTone = pgEnum("branding_tone", [
  "gold",
  "terracotta",
  "sage",
  "blue",
  "violet",
  "rose",
  "teal",
  "orange",
  "wine",
  "graphite",
]);

/**
 * Visual identity of a barbershop (FR-001, FR-004, FR-024). One row per barbershop, created
 * on the first customization; no row means the product default look (FR-010). The display
 * name is `barbershops.name`, reached through `BarbershopDirectory`, not stored here.
 */
export const barbershopBranding = pgTable(
  "barbershop_branding",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => barbershop.id),
    theme: brandingTheme("theme").notNull().default("noir"),
    primaryTone: brandingTone("primary_tone").notNull().default("gold"),
    accentTone: brandingTone("accent_tone").notNull().default("gold"),
    /** Hash of the current logo; null means no logo. Equals `barbershop_logos.version`. */
    logoVersion: text("logo_version"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [tenantPolicy("barbershop_branding_isolation", sql`${t.tenantId}`)],
).enableRLS();
