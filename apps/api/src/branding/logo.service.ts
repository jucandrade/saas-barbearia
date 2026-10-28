import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { LOGO_TYPES, validateLogo, type LogoProblem } from "@barbearia/domain";
import type { Branding } from "@barbearia/contracts";
import { eq } from "drizzle-orm";
import { barbershopBranding, barbershopLogo } from "../db/schema/index.js";
import { TenantDb } from "../db/tenant-db.js";
import { Clock } from "../identity/clock.js";
import { ApiError } from "../identity/http/api-error.js";
import type { AuthenticatedUser } from "../identity/http/http-types.js";
import { BrandingAuditService } from "./branding-audit.service.js";
import { BrandingService } from "./branding.service.js";

const REFUSALS: Record<LogoProblem, ApiError> = {
  too_large: new ApiError(
    413,
    "LOGO_TOO_LARGE",
    "O logo deve ter no máximo 512 KB.",
  ),
  unsupported_format: new ApiError(
    400,
    "LOGO_UNSUPPORTED_FORMAT",
    "Use uma imagem PNG, JPEG ou WebP.",
  ),
  content_mismatch: new ApiError(
    400,
    "LOGO_CONTENT_MISMATCH",
    "O arquivo não corresponde a uma imagem do tipo informado ou está incompleto.",
  ),
  invalid_dimensions: new ApiError(
    400,
    "LOGO_INVALID_DIMENSIONS",
    "O logo deve ter pelo menos 64 pixels no lado menor e no máximo 2.000 pixels no lado maior.",
  ),
};

/** The content type without parameters, in lower case; `undefined` when not one of the three. */
function declaredTypeOf(header: string | undefined): string | undefined {
  const type = header?.split(";")[0]?.trim().toLowerCase();
  return LOGO_TYPES.some((allowed) => allowed === type) ? type : undefined;
}

/** Logo upload (FR-002, FR-003). Validation is by the bytes and happens before any write. */
@Injectable()
export class LogoService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly branding: BrandingService,
    private readonly audit: BrandingAuditService,
    private readonly clock: Clock,
  ) {}

  async upload(
    user: AuthenticatedUser,
    bytes: Buffer,
    contentTypeHeader: string | undefined,
  ): Promise<Branding> {
    const checked = validateLogo(bytes, declaredTypeOf(contentTypeHeader));
    if (!checked.ok) {
      throw REFUSALS[checked.reason];
    }
    const { type, width, height } = checked.value;
    const version = createHash("sha256")
      .update(bytes)
      .digest("hex")
      .slice(0, 16);
    const now = this.clock.now();

    return this.tenantDb.transaction(user.tenantId, async (tx) => {
      await tx
        .insert(barbershopLogo)
        .values({
          tenantId: user.tenantId,
          content: bytes,
          contentType: type,
          width,
          height,
          version,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: barbershopLogo.tenantId,
          set: {
            content: bytes,
            contentType: type,
            width,
            height,
            version,
            updatedAt: now,
          },
        });
      // The first customization may be just a logo: the row is born with the product default.
      await tx
        .insert(barbershopBranding)
        .values({
          tenantId: user.tenantId,
          logoVersion: version,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: barbershopBranding.tenantId,
          set: { logoVersion: version, updatedAt: now },
        });
      await this.audit.record(tx, user.tenantId, {
        type: "logo_changed",
        actorUserId: user.userId,
        details: { fields: ["logo"] },
      });
      return this.branding.read(tx, user.tenantId);
    });
  }

  /** Removes the logo everywhere (FR-013, US5). Idempotent: with no logo it changes and records nothing. */
  remove(user: AuthenticatedUser): Promise<Branding> {
    return this.tenantDb.transaction(user.tenantId, async (tx) => {
      const removed = await tx
        .delete(barbershopLogo)
        .where(eq(barbershopLogo.tenantId, user.tenantId))
        .returning({ version: barbershopLogo.version });
      if (removed.length > 0) {
        await tx
          .update(barbershopBranding)
          .set({ logoVersion: null, updatedAt: this.clock.now() })
          .where(eq(barbershopBranding.tenantId, user.tenantId));
        await this.audit.record(tx, user.tenantId, {
          type: "logo_removed",
          actorUserId: user.userId,
          details: { fields: ["logo"] },
        });
      }
      return this.branding.read(tx, user.tenantId);
    });
  }
}
