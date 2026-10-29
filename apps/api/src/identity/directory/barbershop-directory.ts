import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Transaction } from "../../db/tenant-db.js";
import { barbershop } from "../../db/schema/index.js";
import { ApiError } from "../http/api-error.js";

/** What other contexts may know about the barbershop of the current tenant. */
export interface BarbershopProfile {
  id: string;
  name: string;
  /** Public identifier of the barbershop link. */
  publicSlug: string;
}

/**
 * Public port of the Identity context for the barbershop record (principle VI): the branding
 * context reads and renames the display name here instead of touching `barbershops`.
 * Always runs inside the caller's tenant transaction, so RLS scopes every answer; the tenant id
 * is also in the `WHERE`, so a wrong id fails closed instead of depending on RLS alone.
 */
@Injectable()
export class BarbershopDirectory {
  async getProfile(
    tx: Transaction,
    tenantId: string,
  ): Promise<BarbershopProfile> {
    const [found] = await tx
      .select({
        id: barbershop.id,
        name: barbershop.name,
        publicSlug: barbershop.publicSlug,
      })
      .from(barbershop)
      .where(eq(barbershop.id, tenantId))
      .limit(1);
    if (found === undefined) {
      throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    return found;
  }

  /** Changes the display name (the only column the API role may update) and returns it. */
  async rename(
    tx: Transaction,
    tenantId: string,
    name: string,
  ): Promise<string> {
    const [updated] = await tx
      .update(barbershop)
      .set({ name })
      .where(eq(barbershop.id, tenantId))
      .returning({ name: barbershop.name });
    if (updated === undefined) {
      throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    return updated.name;
  }
}
