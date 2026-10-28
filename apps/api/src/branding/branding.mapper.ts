import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
} from "@barbearia/domain";
import type { Branding } from "@barbearia/contracts";
import type { barbershopBranding } from "../db/schema/index.js";
import type { BarbershopProfile } from "../identity/directory/barbershop-directory.js";

export type BrandingRow = typeof barbershopBranding.$inferSelect;

/** Path (relative to the API base) of the public logo, with the version as cache key. */
export function logoUrlOf(slug: string, version: string | null): string | null {
  return version === null
    ? null
    : `/public/barbershops/${slug}/logo?v=${version}`;
}

/**
 * The identity as the API answers it. No row means the product default look (FR-010) with
 * the name already registered.
 */
export function toBranding(
  profile: BarbershopProfile,
  row: BrandingRow | undefined,
): Branding {
  return {
    name: profile.name,
    theme: row?.theme ?? DEFAULT_THEME,
    primaryTone: row?.primaryTone ?? DEFAULT_PRIMARY_TONE,
    accentTone: row?.accentTone ?? DEFAULT_ACCENT_TONE,
    logoUrl: logoUrlOf(profile.publicSlug, row?.logoVersion ?? null),
    customized: row !== undefined,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
