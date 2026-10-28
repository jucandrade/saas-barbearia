import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  DEFAULT_ACCENT_TONE,
  DEFAULT_PRIMARY_TONE,
  DEFAULT_THEME,
} from "@barbearia/domain";
import type { Branding, UpdateBrandingInput } from "@barbearia/contracts";
import { barbershopBranding } from "../db/schema/index.js";
import { TenantDb, type Transaction } from "../db/tenant-db.js";
import { BarbershopDirectory } from "../identity/directory/barbershop-directory.js";
import { Clock } from "../identity/clock.js";
import type { AuthenticatedUser } from "../identity/http/http-types.js";
import { BrandingAuditService } from "./branding-audit.service.js";
import { toBranding } from "./branding.mapper.js";

/** Visual identity of the barbershop: tema, name and the two colors (FR-001, FR-004, FR-024). */
@Injectable()
export class BrandingService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly directory: BarbershopDirectory,
    private readonly audit: BrandingAuditService,
    private readonly clock: Clock,
  ) {}

  get(user: AuthenticatedUser): Promise<Branding> {
    return this.tenantDb.transaction(user.tenantId, (tx) =>
      this.read(tx, user.tenantId),
    );
  }

  /** Reads inside the caller's transaction; also used by the logo and reset flows. */
  async read(tx: Transaction, tenantId: string): Promise<Branding> {
    const profile = await this.directory.getProfile(tx, tenantId);
    const [row] = await tx
      .select()
      .from(barbershopBranding)
      .where(eq(barbershopBranding.tenantId, tenantId));
    return toBranding(profile, row);
  }

  /** Saves theme, name and tones; the last write wins and every save leaves an event (FR-014). */
  update(
    user: AuthenticatedUser,
    input: UpdateBrandingInput,
  ): Promise<Branding> {
    return this.tenantDb.transaction(user.tenantId, async (tx) => {
      const profile = await this.directory.getProfile(tx, user.tenantId);
      const [current] = await tx
        .select()
        .from(barbershopBranding)
        .where(eq(barbershopBranding.tenantId, user.tenantId));
      const before = {
        theme: current?.theme ?? DEFAULT_THEME,
        primaryTone: current?.primaryTone ?? DEFAULT_PRIMARY_TONE,
        accentTone: current?.accentTone ?? DEFAULT_ACCENT_TONE,
      };

      if (input.name !== profile.name) {
        await this.directory.rename(tx, user.tenantId, input.name);
      }
      const now = this.clock.now();
      await tx
        .insert(barbershopBranding)
        .values({
          tenantId: user.tenantId,
          theme: input.theme,
          primaryTone: input.primaryTone,
          accentTone: input.accentTone,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: barbershopBranding.tenantId,
          set: {
            theme: input.theme,
            primaryTone: input.primaryTone,
            accentTone: input.accentTone,
            updatedAt: now,
          },
        });

      await this.audit.record(tx, user.tenantId, {
        type: "branding_updated",
        actorUserId: user.userId,
        details: changesOf(profile.name, before, input),
      });
      return this.read(tx, user.tenantId);
    });
  }

  /**
   * Back to the product default theme and colors (FR-013). The name and the logo stay as they
   * are; the logo is removed on its own. Nothing saved yet means nothing to restore.
   */
  reset(user: AuthenticatedUser): Promise<Branding> {
    return this.tenantDb.transaction(user.tenantId, async (tx) => {
      const [current] = await tx
        .select()
        .from(barbershopBranding)
        .where(eq(barbershopBranding.tenantId, user.tenantId));
      if (current !== undefined) {
        await tx
          .update(barbershopBranding)
          .set({
            theme: DEFAULT_THEME,
            primaryTone: DEFAULT_PRIMARY_TONE,
            accentTone: DEFAULT_ACCENT_TONE,
            updatedAt: this.clock.now(),
          })
          .where(eq(barbershopBranding.tenantId, user.tenantId));
        const profile = await this.directory.getProfile(tx, user.tenantId);
        await this.audit.record(tx, user.tenantId, {
          type: "branding_reset",
          actorUserId: user.userId,
          details: changesOf(profile.name, current, {
            name: profile.name,
            theme: DEFAULT_THEME,
            primaryTone: DEFAULT_PRIMARY_TONE,
            accentTone: DEFAULT_ACCENT_TONE,
          }),
        });
      }
      return this.read(tx, user.tenantId);
    });
  }
}

type Tones = {
  theme: string;
  primaryTone: string;
  accentTone: string;
};

/**
 * What changed, as field names plus the old and new closed values of theme and tones.
 * The text of the name is never recorded, only that it changed (FR-014, principle IX).
 */
function changesOf(
  previousName: string,
  before: Tones,
  after: Tones & { name: string },
): Record<string, unknown> {
  const fields: string[] = [];
  const details: Record<string, unknown> = {};
  if (after.name !== previousName) {
    fields.push("displayName");
  }
  for (const key of ["theme", "primaryTone", "accentTone"] as const) {
    if (before[key] !== after[key]) {
      fields.push(key);
      details[key] = { from: before[key], to: after[key] };
    }
  }
  return { fields, ...details };
}
