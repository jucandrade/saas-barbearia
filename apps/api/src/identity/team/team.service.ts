import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { normalizeEmail, canDeactivate } from "@barbearia/domain";
import type {
  InviteInput,
  InviteOutput,
  ResendOutput,
  User,
} from "@barbearia/contracts";
import { pgCode, pgMessage, UNIQUE_VIOLATION } from "../../db/pg-errors.js";
import { barbershop, accessToken, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { SessionService } from "../auth/session.service.js";
import { InvitationIssuer } from "../invitations/invitation-issuer.js";
import { ApiError } from "../http/api-error.js";
import type { AuthenticatedUser } from "../http/http-types.js";
import { Clock } from "../clock.js";

type UserRow = typeof user.$inferSelect;

const notFound = (): ApiError =>
  new ApiError(404, "NOT_FOUND", "Recurso não encontrado.");

/** The same response for an e-mail used in this or another barbershop (R13). */
const emailUnavailable = (): ApiError =>
  new ApiError(409, "EMAIL_UNAVAILABLE", "E-mail indisponível.");

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status === "anonymized" ? "deactivated" : row.status,
    barbershopId: row.tenantId,
  };
}

/** Team management by the owner: invite, resend, deactivate and reactivate (FR-007, FR-008). */
@Injectable()
export class TeamService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly issuer: InvitationIssuer,
    private readonly clock: Clock,
  ) {}

  async list(current: AuthenticatedUser): Promise<User[]> {
    const rows = await this.tenantDb.transaction(current.tenantId, (tx) =>
      tx
        .select()
        .from(user)
        .where(ne(user.status, "anonymized"))
        .orderBy(asc(user.name)),
    );
    return rows.map(toUser);
  }

  async invite(
    current: AuthenticatedUser,
    input: InviteInput,
  ): Promise<InviteOutput> {
    const email = normalizeEmail(input.email);
    if (
      (await this.tenantDb.withoutTenant().findUserByEmail(email)) !== undefined
    ) {
      throw emailUnavailable();
    }

    let created: { id: string; token: string; barbershopName: string };
    try {
      created = await this.tenantDb.transaction(
        current.tenantId,
        async (tx) => {
          const id = randomUUID();
          await tx.insert(user).values({
            id,
            tenantId: current.tenantId,
            name: input.name,
            email,
            role: input.role,
            status: "invited",
          });
          const token = await this.issuer.issue(tx, {
            tenantId: current.tenantId,
            userId: id,
          });
          const [shop] = await tx
            .select({ name: barbershop.name })
            .from(barbershop);
          await this.audit.record(tx, current.tenantId, {
            type: "invitation_sent",
            actorType: "user",
            actorUserId: current.userId,
            targetUserId: id,
            details: { role: input.role },
          });
          return { id, token, barbershopName: shop?.name ?? "" };
        },
      );
    } catch (error) {
      // Two simultaneous invitations for the same e-mail: the unique index decides.
      if (pgCode(error) === UNIQUE_VIOLATION) {
        throw emailUnavailable();
      }
      throw error;
    }

    const invitationSent = await this.issuer.send({
      to: email,
      name: input.name,
      barbershop: created.barbershopName,
      token: created.token,
    });
    return {
      invitationSent,
      user: {
        id: created.id,
        name: input.name,
        email,
        role: input.role,
        status: "invited",
        barbershopId: current.tenantId,
      },
    };
  }

  async resendInvitation(
    current: AuthenticatedUser,
    id: string,
  ): Promise<ResendOutput> {
    const data = await this.tenantDb.transaction(
      current.tenantId,
      async (tx) => {
        const [target] = await tx.select().from(user).where(eq(user.id, id));
        if (target === undefined || target.status === "anonymized") {
          throw notFound();
        }
        if (target.status !== "invited") {
          throw new ApiError(
            409,
            "USER_NOT_INVITED",
            "Só é possível reenviar o convite de quem ainda não definiu a senha.",
          );
        }
        const token = await this.issuer.issue(tx, {
          tenantId: current.tenantId,
          userId: target.id,
        });
        const [shop] = await tx
          .select({ name: barbershop.name })
          .from(barbershop);
        await this.audit.record(tx, current.tenantId, {
          type: "invitation_sent",
          actorType: "user",
          actorUserId: current.userId,
          targetUserId: target.id,
          details: { role: target.role, origin: "resend" },
        });
        return { target, token, barbershopName: shop?.name ?? "" };
      },
    );

    const invitationSent = await this.issuer.send({
      to: data.target.email,
      name: data.target.name,
      barbershop: data.barbershopName,
      token: data.token,
    });
    return { invitationSent };
  }

  async deactivate(current: AuthenticatedUser, id: string): Promise<void> {
    await this.tenantDb.transaction(current.tenantId, async (tx) => {
      const [target] = await tx.select().from(user).where(eq(user.id, id));
      if (target === undefined || target.status === "anonymized") {
        throw notFound();
      }
      if (target.status === "deactivated") {
        return; // idempotente
      }

      const all = await tx
        .select({
          id: user.id,
          role: user.role,
          status: user.status,
        })
        .from(user);
      const lastOwner = new ApiError(
        409,
        "LAST_OWNER",
        "A barbearia precisa de pelo menos um dono ativo.",
      );
      if (!canDeactivate(target, all)) {
        throw lastOwner;
      }

      const now = this.clock.now();
      try {
        await tx
          .update(user)
          .set({ status: "deactivated", deactivatedAt: now })
          .where(eq(user.id, target.id));
      } catch (error) {
        // The database trigger is the final guarantee against simultaneous deactivations.
        if (pgMessage(error) === "LAST_OWNER") {
          throw lastOwner;
        }
        throw error;
      }

      await this.sessions.revokeAll(tx, target.id);
      await tx
        .update(accessToken)
        .set({ invalidatedAt: now })
        .where(
          and(
            eq(accessToken.userId, target.id),
            isNull(accessToken.usedAt),
            isNull(accessToken.invalidatedAt),
          ),
        );
      await this.audit.record(tx, current.tenantId, {
        type: "user_deactivated",
        actorType: "user",
        actorUserId: current.userId,
        targetUserId: target.id,
      });
    });
  }

  async reactivate(current: AuthenticatedUser, id: string): Promise<void> {
    const invitation = await this.tenantDb.transaction(
      current.tenantId,
      async (tx) => {
        const [target] = await tx.select().from(user).where(eq(user.id, id));
        if (target === undefined || target.status === "anonymized") {
          throw notFound();
        }
        if (target.status !== "deactivated") {
          throw new ApiError(
            409,
            "USER_NOT_DEACTIVATED",
            "Só é possível reativar um usuário desativado.",
          );
        }

        // With a password, returns with the same credentials; without one, goes back to invited.
        const hasPassword = target.passwordHash !== null;
        await tx
          .update(user)
          .set({
            status: hasPassword ? "active" : "invited",
            deactivatedAt: null,
            failedAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(user.id, target.id));

        let token: string | undefined;
        let barbershopName = "";
        if (!hasPassword) {
          token = await this.issuer.issue(tx, {
            tenantId: current.tenantId,
            userId: target.id,
          });
          const [shop] = await tx
            .select({ name: barbershop.name })
            .from(barbershop);
          barbershopName = shop?.name ?? "";
        }
        await this.audit.record(tx, current.tenantId, {
          type: "user_reactivated",
          actorType: "user",
          actorUserId: current.userId,
          targetUserId: target.id,
        });
        return token === undefined
          ? undefined
          : { token, target, barbershopName };
      },
    );

    if (invitation !== undefined) {
      await this.issuer.send({
        to: invitation.target.email,
        name: invitation.target.name,
        barbershop: invitation.barbershopName,
        token: invitation.token,
      });
    }
  }
}
