import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { resolveTerms, type Terms } from "@barbearia/domain";
import { service, serviceExecutor } from "../db/schema/index.js";
import type { Transaction } from "../db/tenant-db.js";
import { UserDirectory } from "../identity/directory/user-directory.js";

/**
 * Public interface of the catalog for the contexts that depend on it (principle VI): the
 * agenda and the tab ask here which price and duration apply, instead of reading catalog
 * tables. Runs inside the caller's tenant transaction, so RLS scopes every answer.
 */
@Injectable()
export class CatalogFacade {
  constructor(private readonly directory: UserDirectory) {}

  /**
   * Price and duration that apply to one executor of a service (FR-010): his specific values
   * where set, the service defaults otherwise. `undefined` when the user is not an active
   * executor of the service, which includes a service of another barbershop.
   */
  async resolveTerms(
    tx: Transaction,
    serviceId: string,
    userId: string,
  ): Promise<Terms | undefined> {
    const [row] = await tx
      .select({
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        specificPrice: serviceExecutor.priceCents,
        specificDuration: serviceExecutor.durationMinutes,
      })
      .from(service)
      .innerJoin(
        serviceExecutor,
        and(
          eq(serviceExecutor.tenantId, service.tenantId),
          eq(serviceExecutor.serviceId, service.id),
          eq(serviceExecutor.userId, userId),
        ),
      )
      .where(eq(service.id, serviceId));
    if (row === undefined) {
      return undefined;
    }
    const [person] = await this.directory.findByIds(tx, [userId]);
    if (person?.status !== "active") {
      return undefined;
    }
    return resolveTerms(
      { priceCents: row.priceCents, durationMinutes: row.durationMinutes },
      { priceCents: row.specificPrice, durationMinutes: row.specificDuration },
    );
  }
}
