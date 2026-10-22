import { Injectable } from "@nestjs/common";
import { asc, count, eq, sql } from "drizzle-orm";
import { normalizeName } from "@barbearia/domain";
import type {
  CreateCategoryInput,
  OrderInput,
  RenameCategoryInput,
  ServiceCategory,
} from "@barbearia/contracts";
import {
  pgCode,
  UNIQUE_VIOLATION,
  FOREIGN_KEY_VIOLATION,
} from "../../db/pg-errors.js";
import { service, serviceCategory } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { Clock } from "../../identity/clock.js";
import { ApiError } from "../../identity/http/api-error.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { CatalogAuditService } from "../catalog-audit.service.js";

type CategoryRow = typeof serviceCategory.$inferSelect;

const notFound = (): ApiError =>
  new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");

const nameTaken = (): ApiError =>
  new ApiError(
    409,
    "CATEGORY_NAME_TAKEN",
    "Já existe uma categoria com esse nome.",
  );

const notEmpty = (): ApiError =>
  new ApiError(
    409,
    "CATEGORY_NOT_EMPTY",
    "Mova ou desative os serviços desta categoria antes de removê-la.",
  );

function toCategory(row: CategoryRow): ServiceCategory {
  return { id: row.id, name: row.name, position: row.position };
}

/** Service categories managed by the owner (FR-018). */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: CatalogAuditService,
    private readonly clock: Clock,
  ) {}

  async list(current: AuthenticatedUser): Promise<ServiceCategory[]> {
    const rows = await this.tenantDb.transaction(current.tenantId, (tx) =>
      tx
        .select()
        .from(serviceCategory)
        .orderBy(asc(serviceCategory.position), asc(serviceCategory.createdAt)),
    );
    return rows.map(toCategory);
  }

  async create(
    current: AuthenticatedUser,
    input: CreateCategoryInput,
  ): Promise<ServiceCategory> {
    try {
      const row = await this.tenantDb.transaction(
        current.tenantId,
        async (tx) => {
          const [last] = await tx
            .select({
              next: sql<number>`coalesce(max(${serviceCategory.position}), -1) + 1`,
            })
            .from(serviceCategory);
          const [created] = await tx
            .insert(serviceCategory)
            .values({
              tenantId: current.tenantId,
              name: input.name,
              nameKey: normalizeName(input.name),
              position: last?.next ?? 0,
            })
            .returning();
          if (created === undefined) {
            throw new Error("Category insert returned no row");
          }
          await this.audit.record(tx, current.tenantId, {
            type: "category_created",
            actorUserId: current.userId,
            categoryId: created.id,
          });
          return created;
        },
      );
      return toCategory(row);
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw nameTaken();
      }
      throw error;
    }
  }

  async rename(
    current: AuthenticatedUser,
    id: string,
    input: RenameCategoryInput,
  ): Promise<ServiceCategory> {
    try {
      const row = await this.tenantDb.transaction(
        current.tenantId,
        async (tx) => {
          const [updated] = await tx
            .update(serviceCategory)
            .set({
              name: input.name,
              nameKey: normalizeName(input.name),
              updatedAt: this.clock.now(),
            })
            .where(eq(serviceCategory.id, id))
            .returning();
          if (updated === undefined) {
            throw notFound();
          }
          await this.audit.record(tx, current.tenantId, {
            type: "category_renamed",
            actorUserId: current.userId,
            categoryId: id,
            details: { fields: ["name"] },
          });
          return updated;
        },
      );
      return toCategory(row);
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw nameTaken();
      }
      throw error;
    }
  }

  /** The list must be exactly the barbershop's categories, each once, in the new order. */
  async reorder(current: AuthenticatedUser, input: OrderInput): Promise<void> {
    await this.tenantDb.transaction(current.tenantId, async (tx) => {
      const existing = await tx
        .select({ id: serviceCategory.id })
        .from(serviceCategory);
      const known = new Set(existing.map((row) => row.id));
      const sent = new Set(input.ids);
      const exact =
        sent.size === input.ids.length &&
        sent.size === known.size &&
        input.ids.every((id) => known.has(id));
      if (!exact) {
        throw new ApiError(
          400,
          "INVALID_ORDER",
          "A lista precisa conter exatamente as categorias da barbearia.",
        );
      }
      for (const [position, id] of input.ids.entries()) {
        await tx
          .update(serviceCategory)
          .set({ position, updatedAt: this.clock.now() })
          .where(eq(serviceCategory.id, id));
      }
      await this.audit.record(tx, current.tenantId, {
        type: "categories_reordered",
        actorUserId: current.userId,
        details: { count: input.ids.length },
      });
    });
  }

  async remove(current: AuthenticatedUser, id: string): Promise<void> {
    try {
      await this.tenantDb.transaction(current.tenantId, async (tx) => {
        const [found] = await tx
          .select({ id: serviceCategory.id })
          .from(serviceCategory)
          .where(eq(serviceCategory.id, id));
        if (found === undefined) {
          throw notFound();
        }
        const [inside] = await tx
          .select({ total: count() })
          .from(service)
          .where(eq(service.categoryId, id));
        if ((inside?.total ?? 0) > 0) {
          throw notEmpty();
        }
        await tx.delete(serviceCategory).where(eq(serviceCategory.id, id));
        await this.audit.record(tx, current.tenantId, {
          type: "category_deleted",
          actorUserId: current.userId,
          categoryId: id,
        });
      });
    } catch (error) {
      // A service created between the check and the delete: the foreign key decides.
      if (pgCode(error) === FOREIGN_KEY_VIOLATION) {
        throw notEmpty();
      }
      throw error;
    }
  }
}
