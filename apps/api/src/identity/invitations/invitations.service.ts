import { Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  tokenIsCurrent,
  validatePassword,
  type InvalidPasswordReason,
} from "@barbearia/domain";
import type {
  AcceptInvitationInput,
  InvitationInfo,
  User,
} from "@barbearia/contracts";
import { barbershop, accessToken, user } from "../../db/schema/index.js";
import { TenantDb } from "../../db/tenant-db.js";
import { AuditService } from "../audit/audit.service.js";
import { SessionService } from "../auth/session.service.js";
import { ApiError } from "../http/api-error.js";
import { Clock } from "../clock.js";
import { PasswordService } from "../security/password.service.js";
import { hashToken } from "../security/tokens.js";

const INVALID_INVITATION_MESSAGE =
  "Este convite não é mais válido. Peça um novo ao dono da barbearia.";

const PASSWORD_MESSAGES: Record<InvalidPasswordReason, string> = {
  short: "A senha precisa ter pelo menos 8 caracteres.",
  long: "A senha pode ter no máximo 128 caracteres.",
  common: "Essa senha é muito comum. Escolha outra.",
  equals_email: "A senha não pode ser igual ao e-mail.",
  equals_name: "A senha não pode ser igual ao nome.",
};

export const invalidInvitation = (): ApiError =>
  new ApiError(410, "INVALID_INVITATION", INVALID_INVITATION_MESSAGE);

export const weakPassword = (reason: InvalidPasswordReason): ApiError =>
  new ApiError(400, "WEAK_PASSWORD", "Senha não aceita.", {
    password: PASSWORD_MESSAGES[reason],
  });

/** First access by invitation (FR-009): the person themselves sets the password. */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** The current invitation for the token, or 410 (the same response for any reason). */
  private async locate(token: string) {
    const found = await this.tenantDb
      .withoutTenant()
      .findAccessToken(hashToken(token), "invitation");
    if (found === undefined || !tokenIsCurrent(found, this.clock.now())) {
      throw invalidInvitation();
    }
    return found;
  }

  async query(token: string): Promise<InvitationInfo> {
    const invitation = await this.locate(token);
    return this.tenantDb.transaction(invitation.tenantId, async (tx) => {
      const [invited] = await tx
        .select({ name: user.name, status: user.status })
        .from(user)
        .where(eq(user.id, invitation.userId));
      const [shop] = await tx
        .select({ name: barbershop.name })
        .from(barbershop);
      if (invited?.status !== "invited" || shop === undefined) {
        throw invalidInvitation();
      }
      return { name: invited.name, barbershop: shop.name };
    });
  }

  async accept(
    input: AcceptInvitationInput,
  ): Promise<{ user: User; token: string }> {
    const invitation = await this.locate(input.token);

    const invited = await this.tenantDb.transaction(
      invitation.tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(user)
          .where(eq(user.id, invitation.userId));
        return row;
      },
    );
    if (invited?.status !== "invited") {
      throw invalidInvitation();
    }

    const evaluation = validatePassword(input.password, {
      email: invited.email,
      name: invited.name,
    });
    if (!evaluation.valid) {
      throw weakPassword(evaluation.reason);
    }
    const passwordHash = await this.passwords.hash(input.password);

    return this.tenantDb.transaction(invitation.tenantId, async (tx) => {
      const now = this.clock.now();
      // Atomic single use: of two simultaneous acceptances, only one consumes the token.
      const consumed = await tx
        .update(accessToken)
        .set({ usedAt: now })
        .where(
          and(
            eq(accessToken.id, invitation.id),
            isNull(accessToken.usedAt),
            isNull(accessToken.invalidatedAt),
            gt(accessToken.expiresAt, now),
          ),
        )
        .returning({ id: accessToken.id });
      if (consumed.length === 0) {
        throw invalidInvitation();
      }
      const activated = await tx
        .update(user)
        .set({ passwordHash, status: "active" })
        .where(and(eq(user.id, invited.id), eq(user.status, "invited")))
        .returning({ id: user.id });
      if (activated.length === 0) {
        throw invalidInvitation();
      }
      const token = await this.sessions.start(tx, {
        id: invited.id,
        tenantId: invited.tenantId,
        role: invited.role,
      });
      await this.audit.record(tx, invited.tenantId, {
        type: "invitation_accepted",
        actorType: "user",
        actorUserId: invited.id,
        targetUserId: invited.id,
        details: { role: invited.role },
      });
      return {
        token,
        user: {
          id: invited.id,
          name: invited.name,
          email: invited.email,
          role: invited.role,
          status: "active",
          barbershopId: invited.tenantId,
        },
      };
    });
  }
}
