import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { normalizeName } from "@barbearia/domain";
import type {
  CreateServiceInput,
  Service,
  ServiceListQuery,
  UpdateServiceInput,
} from "@barbearia/contracts";
import { pgCode, UNIQUE_VIOLATION } from "../../db/pg-errors.js";
import {
  service,
  serviceCategory,
  serviceExecutor,
} from "../../db/schema/index.js";
import { TenantDb, type Transaction } from "../../db/tenant-db.js";
import { Clock } from "../../identity/clock.js";
import { UserDirectory } from "../../identity/directory/user-directory.js";
import { ApiError } from "../../identity/http/api-error.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { CatalogAuditService } from "../catalog-audit.service.js";

type ServiceRow = typeof service.$inferSelect;

const notFound = (): ApiError =>
  new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");

const nameTaken = (): ApiError =>
  new ApiError(
    409,
    "SERVICE_NAME_TAKEN",
    "Já existe um serviço com esse nome.",
  );

const invalidCategory = (): ApiError =>
  new ApiError(400, "INVALID_DATA", "Dados inválidos.", {
    categoryId: "Escolha uma categoria da sua barbearia.",
  });

export function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    priceCents: row.priceCents,
    durationMinutes: row.durationMinutes,
    status: row.status,
    mine: false,
    effective: {
      priceCents: row.priceCents,
      durationMinutes: row.durationMinutes,
    },
  };
}

/** The catalog of services: what the barbershop sells, with default price and duration. */
@Injectable()
export class ServicesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: CatalogAuditService,
    private readonly directory: UserDirectory,
    private readonly clock: Clock,
  ) {}

  /** Owners filter by status (default all); barbers only ever see active services (FR-012). */
  async list(
    current: AuthenticatedUser,
    query: ServiceListQuery,
  ): Promise<Service[]> {
    const wanted =
      current.role === "owner" ? (query.status ?? "all") : "active";
    return this.tenantDb.transaction(current.tenantId, async (tx) => {
      const rows = await tx
        .select({ row: service })
        .from(service)
        .innerJoin(
          serviceCategory,
          and(
            eq(serviceCategory.tenantId, service.tenantId),
            eq(serviceCategory.id, service.categoryId),
          ),
        )
        .where(
          wanted === "all"
            ? inArray(service.status, ["active", "deactivated"])
            : eq(service.status, wanted),
        )
        .orderBy(
          asc(serviceCategory.position),
          asc(serviceCategory.createdAt),
          asc(service.nameKey),
        );
      return this.withCounts(
        tx,
        current,
        rows.map(({ row }) => toService(row)),
      );
    });
  }

  async get(current: AuthenticatedUser, id: string): Promise<Service> {
    return this.tenantDb.transaction(current.tenantId, async (tx) => {
      const row = await this.find(tx, current, id);
      return this.withCountsOf(tx, current, row);
    });
  }

  async create(
    current: AuthenticatedUser,
    input: CreateServiceInput,
  ): Promise<Service> {
    try {
      return await this.tenantDb.transaction(current.tenantId, async (tx) => {
        await this.requireCategory(tx, input.categoryId);
        const [created] = await tx
          .insert(service)
          .values({
            tenantId: current.tenantId,
            categoryId: input.categoryId,
            name: input.name,
            nameKey: normalizeName(input.name),
            description: blankToNull(input.description),
            durationMinutes: input.durationMinutes,
            priceCents: input.priceCents,
          })
          .returning();
        if (created === undefined) {
          throw new Error("Service insert returned no row");
        }
        await this.audit.record(tx, current.tenantId, {
          type: "service_created",
          actorUserId: current.userId,
          serviceId: created.id,
          details: {
            price: { to: created.priceCents },
            duration: { to: created.durationMinutes },
          },
        });
        return this.withCountsOf(tx, current, created);
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw nameTaken();
      }
      throw error;
    }
  }

  async update(
    current: AuthenticatedUser,
    id: string,
    input: UpdateServiceInput,
  ): Promise<Service> {
    try {
      return await this.tenantDb.transaction(current.tenantId, async (tx) => {
        const before = await this.find(tx, current, id);
        if (input.categoryId !== undefined) {
          await this.requireCategory(tx, input.categoryId);
        }
        const [updated] = await tx
          .update(service)
          .set({
            ...(input.name === undefined
              ? {}
              : { name: input.name, nameKey: normalizeName(input.name) }),
            ...(input.description === undefined
              ? {}
              : { description: blankToNull(input.description) }),
            ...(input.categoryId === undefined
              ? {}
              : { categoryId: input.categoryId }),
            ...(input.priceCents === undefined
              ? {}
              : { priceCents: input.priceCents }),
            ...(input.durationMinutes === undefined
              ? {}
              : { durationMinutes: input.durationMinutes }),
            updatedAt: this.clock.now(),
          })
          .where(eq(service.id, id))
          .returning();
        if (updated === undefined) {
          throw notFound();
        }
        await this.audit.record(tx, current.tenantId, {
          type: "service_updated",
          actorUserId: current.userId,
          serviceId: id,
          details: {
            fields: Object.keys(input),
            ...(input.priceCents === undefined
              ? {}
              : {
                  price: { from: before.priceCents, to: updated.priceCents },
                }),
            ...(input.durationMinutes === undefined
              ? {}
              : {
                  duration: {
                    from: before.durationMinutes,
                    to: updated.durationMinutes,
                  },
                }),
          },
        });
        return this.withCountsOf(tx, current, updated);
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw nameTaken();
      }
      throw error;
    }
  }

  async deactivate(current: AuthenticatedUser, id: string): Promise<void> {
    await this.setStatus(current, id, "deactivated", "service_deactivated");
  }

  async reactivate(current: AuthenticatedUser, id: string): Promise<void> {
    await this.setStatus(current, id, "active", "service_reactivated");
  }

  /**
   * Idempotent: the conditional UPDATE changes the row (and logs the event) only when the
   * status really differs, so repeating the action neither fails nor adds events (FR-005).
   */
  private async setStatus(
    current: AuthenticatedUser,
    id: string,
    status: ServiceRow["status"],
    type: "service_deactivated" | "service_reactivated",
  ): Promise<void> {
    await this.tenantDb.transaction(current.tenantId, async (tx) => {
      const [changed] = await tx
        .update(service)
        .set({ status, updatedAt: this.clock.now() })
        .where(and(eq(service.id, id), ne(service.status, status)))
        .returning({ id: service.id });
      if (changed !== undefined) {
        await this.audit.record(tx, current.tenantId, {
          type,
          actorUserId: current.userId,
          serviceId: id,
        });
        return;
      }
      const [exists] = await tx
        .select({ id: service.id })
        .from(service)
        .where(eq(service.id, id));
      if (exists === undefined) {
        throw notFound();
      }
    });
  }

  private async withCountsOf(
    tx: Transaction,
    current: AuthenticatedUser,
    row: ServiceRow,
  ): Promise<Service> {
    const [one] = await this.withCounts(tx, current, [toService(row)]);
    if (one === undefined) {
      throw new Error("withCounts lost a service");
    }
    return one;
  }

  /**
   * Owners also get how many active executors each service has, so a service nobody performs
   * can be flagged (US3). One query for all links plus one for the users' status.
   */
  private async withCounts(
    tx: Transaction,
    current: AuthenticatedUser,
    services: Service[],
  ): Promise<Service[]> {
    if (current.role !== "owner" || services.length === 0) {
      return services;
    }
    const links = await tx
      .select({
        serviceId: serviceExecutor.serviceId,
        userId: serviceExecutor.userId,
      })
      .from(serviceExecutor)
      .where(
        inArray(
          serviceExecutor.serviceId,
          services.map((s) => s.id),
        ),
      );
    const people = await this.directory.findByIds(tx, [
      ...new Set(links.map((link) => link.userId)),
    ]);
    const active = new Set(
      people.filter((p) => p.status === "active").map((p) => p.id),
    );
    const counts = new Map<string, number>();
    for (const link of links) {
      if (active.has(link.userId)) {
        counts.set(link.serviceId, (counts.get(link.serviceId) ?? 0) + 1);
      }
    }
    return services.map((s) => ({
      ...s,
      executorCount: counts.get(s.id) ?? 0,
    }));
  }

  /** The service, or 404 — also for a deactivated one when the caller is a barber (FR-006). */
  private async find(
    tx: Transaction,
    current: AuthenticatedUser,
    id: string,
  ): Promise<ServiceRow> {
    const [row] = await tx.select().from(service).where(eq(service.id, id));
    if (row === undefined) {
      throw notFound();
    }
    if (current.role !== "owner" && row.status !== "active") {
      throw notFound();
    }
    return row;
  }

  private async requireCategory(
    tx: Transaction,
    categoryId: string,
  ): Promise<void> {
    const [found] = await tx
      .select({ id: serviceCategory.id })
      .from(serviceCategory)
      .where(eq(serviceCategory.id, categoryId));
    if (found === undefined) {
      throw invalidCategory();
    }
  }
}

function blankToNull(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
