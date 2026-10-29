import { Injectable } from "@nestjs/common";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
  isValidSlug,
} from "@barbearia/domain";
import type { PublicIdentity } from "@barbearia/contracts";
import { TenantDb, type PublicLogoRow } from "../db/tenant-db.js";
import { logoUrlOf } from "./branding.mapper.js";

/** What a link that leads nowhere shows: the product look, with no name (FR-030). */
const UNKNOWN_LINK: PublicIdentity = {
  name: null,
  theme: DEFAULT_THEME,
  primaryTone: DEFAULT_PRIMARY_TONE,
  accentTone: DEFAULT_ACCENT_TONE,
  logoUrl: null,
};

/**
 * Identity behind a barbershop link, for people without a session (FR-029). Everything goes
 * through the two `public_get_*` database functions; no table is read directly.
 */
@Injectable()
export class PublicBrandingService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * An unknown link and a barbershop that never customized anything both end in a default
   * identity built the same way, so nothing tells them apart (FR-030). A malformed slug can
   * never belong to a barbershop, so it skips the lookup without revealing anything.
   */
  async identity(slug: string): Promise<PublicIdentity> {
    if (!isValidSlug(slug)) {
      return UNKNOWN_LINK;
    }
    const found = await this.tenantDb.publicLookups().findIdentity(slug);
    if (found === undefined) {
      return UNKNOWN_LINK;
    }
    return {
      name: found.name,
      theme: found.theme,
      primaryTone: found.primaryTone,
      accentTone: found.accentTone,
      logoUrl: logoUrlOf(slug, found.logoVersion),
    };
  }

  /** The logo bytes, or `undefined` when the link or the logo does not exist (same answer for both). */
  async logo(slug: string): Promise<PublicLogoRow | undefined> {
    if (!isValidSlug(slug)) {
      return undefined;
    }
    return this.tenantDb.publicLookups().findLogo(slug);
  }
}
