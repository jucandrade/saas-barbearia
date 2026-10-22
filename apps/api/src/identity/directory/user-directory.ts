import { Injectable } from "@nestjs/common";
import { inArray, eq } from "drizzle-orm";
import type { Role, UserStatus } from "@barbearia/domain";
import type { Transaction } from "../../db/tenant-db.js";
import { user } from "../../db/schema/index.js";
import { ApiError } from "../http/api-error.js";

/** What other contexts may know about a user: never the e-mail or any credential. */
export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
  status: UserStatus;
}

/**
 * Public port of the Identity context for other contexts (principle VI). They ask here
 * instead of reading `users`, so the rule "who is a valid executor" lives in one place.
 * Always runs inside the caller's tenant transaction, so RLS scopes every answer.
 */
@Injectable()
export class UserDirectory {
  async findByIds(tx: Transaction, ids: string[]): Promise<DirectoryUser[]> {
    if (ids.length === 0) {
      return [];
    }
    return tx
      .select({
        id: user.id,
        name: user.name,
        role: user.role,
        status: user.status,
      })
      .from(user)
      .where(inArray(user.id, ids));
  }

  /**
   * Only an active user of the context's barbershop, owner or barber, can perform services
   * (FR-007, FR-008). A user of another barbershop is indistinguishable from an unknown id.
   */
  async assertEligibleExecutor(
    tx: Transaction,
    id: string,
  ): Promise<DirectoryUser> {
    const [found] = await tx
      .select({
        id: user.id,
        name: user.name,
        role: user.role,
        status: user.status,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (found === undefined) {
      throw new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    if (found.status !== "active") {
      throw new ApiError(
        409,
        "EXECUTOR_NOT_ELIGIBLE",
        "Só usuários ativos da barbearia podem executar serviços.",
      );
    }
    return found;
  }
}
