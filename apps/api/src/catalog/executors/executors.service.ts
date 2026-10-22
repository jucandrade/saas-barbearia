import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type {
  Executor,
  ExecutorInput,
  ExecutorsOutput,
} from "@barbearia/contracts";
import { service, serviceExecutor } from "../../db/schema/index.js";
import { TenantDb, type Transaction } from "../../db/tenant-db.js";
import { Clock } from "../../identity/clock.js";
import { UserDirectory } from "../../identity/directory/user-directory.js";
import { ApiError } from "../../identity/http/api-error.js";
import type { AuthenticatedUser } from "../../identity/http/http-types.js";
import { CatalogAuditService } from "../catalog-audit.service.js";

const notFound = (): ApiError =>
  new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");

/** Who performs each service, with optional specific price and duration (FR-007, FR-009, FR-011). */
@Injectable()
export class ExecutorsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly directory: UserDirectory,
    private readonly audit: CatalogAuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Active executors only. A barber sees the names of the others but only his own specific
   * values; the owner sees everything. The e-mail is never part of the answer.
   */
  async list(
    current: AuthenticatedUser,
    serviceId: string,
  ): Promise<ExecutorsOutput> {
    return this.tenantDb.transaction(current.tenantId, async (tx) => {
      await this.requireVisibleService(tx, current, serviceId);
      const links = await tx
        .select()
        .from(serviceExecutor)
        .where(eq(serviceExecutor.serviceId, serviceId));
      const users = await this.directory.findByIds(
        tx,
        links.map((link) => link.userId),
      );
      const active = new Map(
        users.filter((u) => u.status === "active").map((u) => [u.id, u]),
      );
      const executors: Executor[] = [];
      for (const link of links) {
        const person = active.get(link.userId);
        if (person === undefined) continue;
        const showsValues =
          current.role === "owner" || link.userId === current.userId;
        executors.push({
          userId: link.userId,
          name: person.name,
          ...(showsValues
            ? {
                priceCents: link.priceCents,
                durationMinutes: link.durationMinutes,
              }
            : {}),
        });
      }
      executors.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return { executors };
    });
  }

  /**
   * Links the user, or changes the specific values of an existing link. A field left out of
   * the input stays as it is; `null` goes back to the service default.
   */
  async link(
    current: AuthenticatedUser,
    serviceId: string,
    userId: string,
    input: ExecutorInput,
  ): Promise<Executor> {
    return this.tenantDb.transaction(current.tenantId, async (tx) => {
      await this.requireService(tx, serviceId);
      const person = await this.directory.assertEligibleExecutor(tx, userId);

      const [existing] = await tx
        .select()
        .from(serviceExecutor)
        .where(
          and(
            eq(serviceExecutor.serviceId, serviceId),
            eq(serviceExecutor.userId, userId),
          ),
        );

      if (existing === undefined) {
        const [created] = await tx
          .insert(serviceExecutor)
          .values({
            tenantId: current.tenantId,
            serviceId,
            userId,
            priceCents: input.priceCents ?? null,
            durationMinutes: input.durationMinutes ?? null,
          })
          .returning();
        if (created === undefined) {
          throw new Error("Executor insert returned no row");
        }
        await this.audit.record(tx, current.tenantId, {
          type: "executor_linked",
          actorUserId: current.userId,
          serviceId,
          targetUserId: userId,
          details: valuesOf(created),
        });
        return toExecutor(person.name, created);
      }

      const price =
        input.priceCents === undefined ? existing.priceCents : input.priceCents;
      const duration =
        input.durationMinutes === undefined
          ? existing.durationMinutes
          : input.durationMinutes;
      if (
        price === existing.priceCents &&
        duration === existing.durationMinutes
      ) {
        return toExecutor(person.name, existing);
      }
      const [updated] = await tx
        .update(serviceExecutor)
        .set({
          priceCents: price,
          durationMinutes: duration,
          updatedAt: this.clock.now(),
        })
        .where(
          and(
            eq(serviceExecutor.serviceId, serviceId),
            eq(serviceExecutor.userId, userId),
          ),
        )
        .returning();
      if (updated === undefined) {
        throw notFound();
      }
      await this.audit.record(tx, current.tenantId, {
        type: "executor_updated",
        actorUserId: current.userId,
        serviceId,
        targetUserId: userId,
        details: {
          price: { from: existing.priceCents, to: updated.priceCents },
          duration: {
            from: existing.durationMinutes,
            to: updated.durationMinutes,
          },
        },
      });
      return toExecutor(person.name, updated);
    });
  }

  /** Idempotent: unlinking someone who is not linked is not an error and logs nothing. */
  async unlink(
    current: AuthenticatedUser,
    serviceId: string,
    userId: string,
  ): Promise<void> {
    await this.tenantDb.transaction(current.tenantId, async (tx) => {
      await this.requireService(tx, serviceId);
      const removed = await tx
        .delete(serviceExecutor)
        .where(
          and(
            eq(serviceExecutor.serviceId, serviceId),
            eq(serviceExecutor.userId, userId),
          ),
        )
        .returning({ userId: serviceExecutor.userId });
      if (removed.length > 0) {
        await this.audit.record(tx, current.tenantId, {
          type: "executor_unlinked",
          actorUserId: current.userId,
          serviceId,
          targetUserId: userId,
        });
      }
    });
  }

  private async requireService(tx: Transaction, id: string): Promise<void> {
    const [found] = await tx
      .select({ id: service.id })
      .from(service)
      .where(eq(service.id, id));
    if (found === undefined) {
      throw notFound();
    }
  }

  /** A barber cannot see anything about a deactivated service (FR-006). */
  private async requireVisibleService(
    tx: Transaction,
    current: AuthenticatedUser,
    id: string,
  ): Promise<void> {
    const [found] = await tx
      .select({ status: service.status })
      .from(service)
      .where(eq(service.id, id));
    if (
      found === undefined ||
      (current.role !== "owner" && found.status !== "active")
    ) {
      throw notFound();
    }
  }
}

type LinkRow = typeof serviceExecutor.$inferSelect;

function toExecutor(name: string, link: LinkRow): Executor {
  return {
    userId: link.userId,
    name,
    priceCents: link.priceCents,
    durationMinutes: link.durationMinutes,
  };
}

function valuesOf(link: LinkRow): Record<string, unknown> {
  return {
    ...(link.priceCents === null ? {} : { price: { to: link.priceCents } }),
    ...(link.durationMinutes === null
      ? {}
      : { duration: { to: link.durationMinutes } }),
  };
}
